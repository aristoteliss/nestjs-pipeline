/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type LoggerService,
  Optional,
} from '@nestjs/common';
import {
  createPipelineItem,
  type IPipelineBehavior,
  type IPipelineBehaviorContract,
  type IPipelineBehaviorOptionsResolver,
  type IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorDiagnostic,
  type PipelineBehaviorOrderRule,
  type PipelineBehaviorValidationContext,
  type PipelineItemToken,
  setPipelineItem,
  untyped,
} from '@nestjs-pipeline/core';
import {
  DEFAULT_IDEMPOTENCY_TTL_MS,
  IDEMPOTENCY_DEFAULT_OPTIONS,
  IDEMPOTENCY_STORE,
} from './constants/tokens';
import { IdempotencyCompletionError } from './errors/idempotency-completion.error';
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

/**
 * Unique symbol key set on `context.items` holding the active idempotency key string.
 *
 * @example
 * ```ts
 * const key = context.items.get(IDEMPOTENCY_KEY_ITEM) as string | undefined;
 * ```
 */
export const IDEMPOTENCY_KEY_ITEM = Symbol('IDEMPOTENCY_KEY_ITEM');

/**
 * Typed token for {@link IDEMPOTENCY_KEY_ITEM}: the active idempotency key. Reads and writes the same
 * `context.items` entry through `getPipelineItem` / `requirePipelineItem`.
 */
export const IDEMPOTENCY_KEY_ITEM_TOKEN: PipelineItemToken<string> =
  createPipelineItem<string>('IDEMPOTENCY_KEY_ITEM', IDEMPOTENCY_KEY_ITEM);

/**
 * Unique symbol key set on `context.items` to `true` when the response was replayed
 * from a previously-stored record (the handler did not run this time).
 *
 * @example
 * ```ts
 * const wasReplayed = context.items.get(IDEMPOTENCY_REPLAYED_ITEM) === true;
 * ```
 */
export const IDEMPOTENCY_REPLAYED_ITEM = Symbol('IDEMPOTENCY_REPLAYED_ITEM');

/**
 * Typed token for {@link IDEMPOTENCY_REPLAYED_ITEM}: the idempotent replay flag. Reads and writes the same
 * `context.items` entry through `getPipelineItem` / `requirePipelineItem`.
 */
export const IDEMPOTENCY_REPLAYED_ITEM_TOKEN: PipelineItemToken<boolean> =
  createPipelineItem<boolean>(
    'IDEMPOTENCY_REPLAYED_ITEM',
    IDEMPOTENCY_REPLAYED_ITEM,
  );

/**
 * Unique symbol key set on `context.items` to `true` when a handler completed after
 * its claim had expired or been replaced. The successful handler result is returned,
 * but this execution is not allowed to overwrite the newer owner's replay state.
 *
 * @example
 * ```ts
 * const ownershipLost = context.items.get(IDEMPOTENCY_OWNERSHIP_LOST_ITEM) === true;
 * ```
 */
export const IDEMPOTENCY_OWNERSHIP_LOST_ITEM = Symbol(
  'IDEMPOTENCY_OWNERSHIP_LOST_ITEM',
);

/**
 * Typed token for {@link IDEMPOTENCY_OWNERSHIP_LOST_ITEM}: the idempotency ownership-lost flag. Reads and writes the same
 * `context.items` entry through `getPipelineItem` / `requirePipelineItem`.
 */
export const IDEMPOTENCY_OWNERSHIP_LOST_ITEM_TOKEN: PipelineItemToken<boolean> =
  createPipelineItem<boolean>(
    'IDEMPOTENCY_OWNERSHIP_LOST_ITEM',
    IDEMPOTENCY_OWNERSHIP_LOST_ITEM,
  );

const DEFAULT_SCOPE: IdempotencyRequestKind[] = ['command'];

/** Whether this request kind is configured for idempotency. */
function inScope(
  options: IdempotencyBehaviorOptions | undefined,
  requestKind: IPipelineContext['requestKind'],
): boolean {
  return (options?.scope ?? DEFAULT_SCOPE).includes(
    requestKind as IdempotencyRequestKind,
  );
}

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
 * - **key reused with a different payload** → throw it as `key_reuse` (`422`);
 * - **completed under a different authorization scope** → throw it as
 *   `replay_scope` (`409`), when a
 *   {@link IdempotencyBehaviorOptions.replayScopeFactory} is configured. The
 *   record is kept and the handler is not re-executed, so a permission change
 *   cannot duplicate the effect.
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
export class IdempotencyBehavior
  implements
    IPipelineBehavior,
    IPipelineBehaviorOptionsResolver<IdempotencyBehaviorOptions>
{
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    order: (
      context: PipelineBehaviorValidationContext,
    ): PipelineBehaviorOrderRule | undefined => {
      const options = context.effectiveOptions as
        | IdempotencyBehaviorOptions
        | undefined;
      if (!inScope(options, context.requestKind)) {
        return undefined;
      }
      return {
        after: ['@nestjs-pipeline/casl:CaslBehavior', 'CaslBehavior'],
      };
    },
    validate: (
      context: PipelineBehaviorValidationContext,
    ): PipelineBehaviorDiagnostic[] | undefined => {
      const options = context.effectiveOptions as
        | IdempotencyBehaviorOptions
        | undefined;
      if (!inScope(options, context.requestKind)) {
        return undefined;
      }

      if (
        (context.declarationSource === 'handler' ||
          context.declarationSource === 'both') &&
        !options?.keyFactory
      ) {
        return [
          {
            handlerName: context.handlerName,
            behaviorName: IdempotencyBehavior.name,
            message:
              'Explicit IdempotencyBehavior intent requires an explicit `keyFactory` for deduplication',
            fix:
              'Provide keyFactory in @UsePipeline([IdempotencyBehavior, { keyFactory: ... }]) ' +
              'or use createPartitionedIdempotencyKeyFactory(...).',
          },
        ];
      }

      if (options?.keyFactory && typeof options.keyFactory !== 'function') {
        return [
          {
            handlerName: context.handlerName,
            behaviorName: IdempotencyBehavior.name,
            message: `IdempotencyBehavior keyFactory must be a callable function, received ${typeof options.keyFactory}`,
            fix: 'Pass a valid function (ctx) => string to the keyFactory option in @UsePipeline([IdempotencyBehavior, { keyFactory: ... }]).',
          },
        ];
      }

      return undefined;
    },
  };

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
    const options = this.resolveEffectiveOptions(
      context.getBehaviorOptions<IdempotencyBehaviorOptions>(
        IdempotencyBehavior,
      ),
    );

    if (!inScope(options, context.requestKind)) {
      return next();
    }

    const key = options.keyFactory?.(context);
    if (!key) {
      // No idempotency key → nothing to dedupe; run normally.
      return next();
    }

    setPipelineItem(context, IDEMPOTENCY_KEY_ITEM_TOKEN, key);

    const ttl = options.ttl ?? DEFAULT_IDEMPOTENCY_TTL_MS;
    if (!Number.isSafeInteger(ttl) || ttl <= 0) {
      throw new TypeError(
        'Idempotency ttl must be a positive safe integer in milliseconds.',
      );
    }
    const fingerprint =
      (options.fingerprint ?? true)
        ? fingerprintValue(context.request)
        : undefined;
    // Resolved before the claim so a missing authorization context rejects the
    // operation instead of claiming a key it cannot later prove the scope of.
    const replayScope = options.replayScopeFactory?.(context);
    const scopeRequired = options.replayScopeFactory !== undefined;
    const claimId = randomUUID();

    const claim: IdempotencyRecord = {
      key,
      status: 'in_progress',
      requestName: context.requestName,
      claimId,
      fingerprint,
      replayScope,
      createdAt: new Date().toISOString(),
    };

    let claimed = await this.store.setIfAbsent(key, claim, ttl);
    if (!claimed) {
      const existing = await this.store.get(key);

      if (existing) {
        return this.replayOrConflict(
          context,
          key,
          fingerprint,
          { replayScope, scopeRequired },
          existing,
        );
      }

      // The record disappeared or expired after the failed claim. Give this
      // request one bounded opportunity to claim the now-available key instead
      // of reporting a false in-progress conflict.
      claimed = await this.store.setIfAbsent(key, claim, ttl);
      if (!claimed) {
        return this.replayOrConflict(context, key, fingerprint, {
          replayScope,
          scopeRequired,
        });
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
    } catch (cause) {
      // The handler already succeeded, so retain the claim until expiry rather
      // than allowing an immediate retry to repeat completed side effects.
      this.logger.error?.(
        `Idempotency response snapshot failed after ${context.requestName} ` +
          `executed successfully (key: ${key}). The claim is retained until it ` +
          'expires; retrying the business request may repeat side effects.',
        cause instanceof Error ? cause.stack : undefined,
        IdempotencyBehavior.name,
      );
      throw new IdempotencyCompletionError(key, claimId, cause, 'snapshot');
    }

    // The handler has already succeeded. Completion must be conditional on
    // still owning the claim; a stale execution must never overwrite a newer
    // execution that reclaimed the key after this claim's TTL elapsed.
    let completed: boolean;
    try {
      completed = await this.store.completeIfOwned(
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
    } catch (cause) {
      this.logger.error?.(
        `Idempotency completion persistence failed after ${context.requestName} ` +
          `executed successfully (key: ${key}). Retrying the business request may ` +
          'repeat side effects.',
        cause instanceof Error ? cause.stack : undefined,
        IdempotencyBehavior.name,
      );
      throw new IdempotencyCompletionError(key, claimId, cause, 'store');
    }

    if (!completed) {
      setPipelineItem(context, IDEMPOTENCY_OWNERSHIP_LOST_ITEM_TOKEN, true);
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
    scope: { replayScope?: string; scopeRequired: boolean },
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

    // A fingerprinted request never replays a record that cannot prove payload identity.
    if (
      existing.requestName !== context.requestName ||
      (fingerprint && existing.fingerprint !== fingerprint)
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

    // A completed record may only be replayed to a caller whose authorization
    // scope matches the one it was produced under. A record stored without a
    // scope cannot prove that, so it fails closed rather than replaying. The
    // record is retained: re-executing a completed operation would duplicate it.
    if (
      scope.scopeRequired &&
      (existing.replayScope === undefined ||
        existing.replayScope !== scope.replayScope)
    ) {
      this.logger.warn?.(
        `Refusing to replay ${context.requestName} (key: ${key}): the stored ` +
          'response was authorized under a different scope than this caller.',
        IdempotencyBehavior.name,
      );
      throw new IdempotencyConflictError({
        key,
        requestName: context.requestName,
        reason: 'replay_scope',
      });
    }

    setPipelineItem(context, IDEMPOTENCY_REPLAYED_ITEM_TOKEN, true);
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

  /** Shallow-merges pipeline-level options over the module defaults. */
  resolveEffectiveOptions(
    options?: IdempotencyBehaviorOptions,
  ): IdempotencyBehaviorOptions {
    if (!options) return this.defaults;
    return { ...this.defaults, ...options };
  }
}
