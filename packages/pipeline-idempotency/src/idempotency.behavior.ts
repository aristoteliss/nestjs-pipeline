/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type LoggerService,
  Optional,
} from '@nestjs/common';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  type NextDelegate,
  untyped,
} from '@nestjs-pipeline/core';
import {
  DEFAULT_IDEMPOTENCY_TTL_MS,
  IDEMPOTENCY_DEFAULT_OPTIONS,
  IDEMPOTENCY_STORE,
} from './constants/tokens';
import { IdempotencyConflictError } from './errors/idempotency-conflict.error';
import { fingerprintValue } from './helpers/fingerprint';
import { toJsonSnapshot } from './helpers/json-snapshot';
import type { IdempotencyBehaviorOptions } from './interfaces/idempotency-options.interface';
import type {
  IdempotencyRecord,
  IdempotencyRequestKind,
  JsonValue,
} from './interfaces/idempotency-record.interface';
import type { IdempotencyStore } from './interfaces/idempotency-store.interface';

/** Item key set on the pipeline context holding the active idempotency key. */
export const IDEMPOTENCY_KEY_ITEM = 'idempotency.key';

/**
 * Item key set on the pipeline context to `true` when the response was replayed
 * from a previously-stored record (the handler did not run this time).
 */
export const IDEMPOTENCY_REPLAYED_ITEM = 'idempotency.replayed';

/**
 * Item key set to `true` when a handler completed after its claim had expired or
 * been replaced. The successful handler result is returned, but this execution
 * is not allowed to overwrite the newer owner's replay state.
 */
export const IDEMPOTENCY_OWNERSHIP_LOST_ITEM = 'idempotency.ownershipLost';

const DEFAULT_SCOPE: IdempotencyRequestKind[] = ['command'];

/**
 * Pipeline behavior that deduplicates concurrent requests sharing an
 * idempotency key and replays the stored response after a successful execution.
 *
 * For each in-scope request it derives a key
 * ({@link IdempotencyBehaviorOptions.keyFactory}), then atomically claims it in
 * a pluggable {@link IdempotencyStore}:
 *
 * - **first claim** → run the handler and store the completed response;
 * - **duplicate, completed** → return the stored response (no re-execution);
 * - **duplicate, in progress** → throw {@link IdempotencyConflictError} (`409`);
 * - **key reused with a different payload** → throw it as `key_reuse` (`422`).
 *
 * Each claim carries a unique owner token. Completion and release compare that
 * token atomically, so an execution that outlives its TTL cannot overwrite or
 * delete a newer claim after the key is reclaimed.
 *
 * When the handler throws, `releaseOnError` controls whether the key remains
 * claimed. It defaults to `true`, so failed executions release the key and a
 * later retry may execute the handler again. Set it to `false` when retaining
 * the claim after a failure is preferable to retryability.
 *
 * Store-agnostic by design: memory (default), Redis, Postgres, or your own are
 * one-line swaps in {@link IdempotencyModule.forRoot}. When no key is produced,
 * the handler runs normally.
 *
 * @example Per-handler, keyed off an `Idempotency-Key` header
 * ```ts
 * @CommandHandler(CreatePaymentCommand)
 * @UsePipeline([IdempotencyBehavior, {
 *   keyFactory: (c) => c.items.get('idempotencyKey') as string | undefined,
 *   ttl: 86_400_000,
 * }])
 * export class CreatePaymentHandler {}
 * ```
 */
@Injectable()
export class IdempotencyBehavior implements IPipelineBehavior {
  private readonly logger: LoggerService;
  private readonly defaults: IdempotencyBehaviorOptions;

  constructor(
    @Inject(IDEMPOTENCY_STORE)
    private readonly store: IdempotencyStore,
    @Optional()
    @Inject(IDEMPOTENCY_DEFAULT_OPTIONS)
    defaults?: IdempotencyBehaviorOptions,
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    const candidate = untyped(this.store);
    if (
      typeof candidate.completeIfOwned !== 'function' ||
      typeof candidate.deleteIfOwned !== 'function'
    ) {
      throw new TypeError(
        'The configured IdempotencyStore is missing required methods. ' +
          'IdempotencyStore requires atomic completeIfOwned() and deleteIfOwned() operations.',
      );
    }

    this.defaults = defaults ?? {};
    this.logger =
      logger ?? new Logger(IdempotencyBehavior.name, { timestamp: true });
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options = this.resolveOptions(context);

    if (!this.inScope(context, options)) {
      return next();
    }

    const key = options.keyFactory?.(context);
    if (!key) {
      // No idempotency key → nothing to dedupe; run normally.
      return next();
    }

    context.items.set(IDEMPOTENCY_KEY_ITEM, key);

    const ttl = options.ttl ?? DEFAULT_IDEMPOTENCY_TTL_MS;
    const fingerprint =
      (options.fingerprint ?? true)
        ? fingerprintValue(context.request)
        : undefined;
    const claimId = randomUUID();

    const claim: IdempotencyRecord = {
      key,
      status: 'in_progress',
      requestName: context.requestName,
      claimId,
      fingerprint,
      createdAt: new Date().toISOString(),
    };

    let claimed = await this.store.setIfAbsent(key, claim, ttl);
    if (!claimed) {
      const existing = await this.store.get(key);

      if (existing) {
        return this.replayOrConflict(context, key, fingerprint, existing);
      }

      // The record disappeared or expired after the failed claim. Give this
      // request one bounded opportunity to claim the now-available key instead
      // of reporting a false in-progress conflict.
      claimed = await this.store.setIfAbsent(key, claim, ttl);
      if (!claimed) {
        return this.replayOrConflict(context, key, fingerprint);
      }
    }

    let response: unknown;
    try {
      response = await next();
    } catch (error) {
      if (options.releaseOnError ?? true) {
        await this.release(key, claimId);
      }
      throw error;
    }

    let responseSnapshot: JsonValue | undefined;
    try {
      responseSnapshot = toJsonSnapshot(response);
    } catch (error) {
      // The handler has already completed, but an unusable response must not
      // leave a permanently in-progress claim. Surface the contract violation
      // after releasing this execution's claim.
      await this.release(key, claimId);
      throw error;
    }

    // The handler has already succeeded. Completion must be conditional on
    // still owning the claim; a stale execution must never overwrite a newer
    // execution that reclaimed the key after this claim's TTL elapsed.
    const completed = await this.store.completeIfOwned(
      key,
      claimId,
      {
        ...claim,
        status: 'completed',
        response: responseSnapshot,
        completedAt: new Date().toISOString(),
      },
      ttl,
    );

    if (!completed) {
      context.items.set(IDEMPOTENCY_OWNERSHIP_LOST_ITEM, true);
      this.logger.error?.(
        `Idempotency claim ownership was lost after ${context.requestName} ` +
          `completed successfully (key: ${key}). The successful result is being ` +
          'returned, but this execution did not overwrite the newer claim.',
        IdempotencyBehavior.name,
      );
    }

    return response;
  }

  /**
   * The key was already claimed. Replay a completed response, or surface a
   * conflict for an in-progress duplicate or a key reused with a new payload.
   */
  private async replayOrConflict(
    context: IPipelineContext,
    key: string,
    fingerprint: string | undefined,
    knownExisting?: IdempotencyRecord,
  ): Promise<unknown> {
    const existing = knownExisting ?? (await this.store.get(key));

    // A second failed claim followed by another disappearing record indicates
    // repeated contention. The retry is deliberately bounded to avoid a hot
    // loop if a backend is unstable or claims are being rapidly replaced.
    if (!existing) {
      throw new IdempotencyConflictError({
        key,
        requestName: context.requestName,
        reason: 'in_progress',
      });
    }

    if (existing.requestName !== context.requestName) {
      throw new IdempotencyConflictError({
        key,
        requestName: context.requestName,
        reason: 'key_reuse',
      });
    }

    if (
      fingerprint &&
      existing.fingerprint &&
      existing.fingerprint !== fingerprint
    ) {
      throw new IdempotencyConflictError({
        key,
        requestName: context.requestName,
        reason: 'key_reuse',
      });
    }

    if (existing.status === 'in_progress') {
      throw new IdempotencyConflictError({
        key,
        requestName: context.requestName,
        reason: 'in_progress',
      });
    }

    context.items.set(IDEMPOTENCY_REPLAYED_ITEM, true);
    this.logger.debug?.(
      `Replaying idempotent response for ${context.requestName} (key: ${key})`,
      IdempotencyBehavior.name,
    );
    return existing.response;
  }

  /**
   * Release a failed execution's claim only if it still owns the key; never let
   * cleanup break propagation of the original handler error.
   */
  private async release(key: string, claimId: string): Promise<void> {
    try {
      await this.store.deleteIfOwned(key, claimId);
    } catch (error) {
      this.logger.warn?.(
        `Failed to release idempotency key "${key}": ` +
          `${error instanceof Error ? error.message : error}`,
        IdempotencyBehavior.name,
      );
    }
  }

  /** Whether this request kind is configured for idempotency. */
  private inScope(
    context: IPipelineContext,
    options: IdempotencyBehaviorOptions,
  ): boolean {
    const scope = options.scope ?? DEFAULT_SCOPE;
    return scope.includes(context.requestKind as IdempotencyRequestKind);
  }

  /** Shallow-merges per-handler options over the module defaults. */
  private resolveOptions(
    context: IPipelineContext,
  ): IdempotencyBehaviorOptions {
    const handlerOptions =
      context.getBehaviorOptions<IdempotencyBehaviorOptions>(
        IdempotencyBehavior,
      );
    if (!handlerOptions) return this.defaults;
    return { ...this.defaults, ...handlerOptions };
  }
}
