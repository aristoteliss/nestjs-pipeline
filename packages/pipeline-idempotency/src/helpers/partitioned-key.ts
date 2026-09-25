/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { joinKeySegments } from '@cqrs-ddd/safe-stringify';
import { type IPipelineContext } from '@nestjs-pipeline/core';
import { MissingIdempotencyPartitionError } from '../errors/missing-partition.error';
import type { IdempotencyKeyFactory } from '../interfaces/idempotency-options.interface';

/**
 * Resolves the principal performing an operation.
 *
 * Return one identifier, or several segments when the identity has more than one
 * dimension — for example `['service', clientId]`, so a service and a user that
 * share an id string never share a namespace. Read it from authenticated context,
 * never from a request body field the caller controls.
 */
export type IdempotencyPrincipalFactory = (
  context: IPipelineContext,
) => string | readonly string[] | undefined;

/**
 * Resolves the identity of one operation within the principal's namespace: a
 * client-supplied `Idempotency-Key`, or a business identifier the operation is
 * deduplicated by.
 */
export type IdempotencyOperationFactory = (
  context: IPipelineContext,
) => string | undefined;

/** Options for {@link createPartitionedIdempotencyKeyFactory}. */
export interface PartitionedIdempotencyKeyOptions {
  /** Who performs the operation. Required, and never defaulted. */
  principal: IdempotencyPrincipalFactory;

  /** Which operation this is, within that principal's namespace. */
  operation: IdempotencyOperationFactory;

  /**
   * Name of the operation kind. Defaults to `context.requestName`; pass a stable
   * value when the request class may be renamed without the operation changing.
   */
  action?: string;

  /**
   * Leading namespace segment. Change it only deliberately: a new namespace
   * abandons every claim stored under the old one, so a completed operation can
   * execute again until those records expire.
   */
  version?: string;

  /**
   * Include `context.tenantId`, so equal principal ids in two tenants never share
   * a namespace.
   *
   * @default true
   */
  includeTenant?: boolean;

  /**
   * Whether a missing tenant is an error rather than an absent segment.
   *
   * @default the value of `includeTenant`
   */
  requireTenant?: boolean;

  /**
   * Behavior when the operation identity is absent.
   *
   * - `throw` — the request is rejected.
   * - `skip` — no key is produced, so the request runs without deduplication.
   *   Use this for an optional client `Idempotency-Key` header.
   *
   * A missing principal always throws: there is no safe namespace to fall back to.
   *
   * @default 'throw'
   */
  onMissingOperation?: 'throw' | 'skip';
}

/**
 * Creates an {@link IdempotencyKeyFactory} whose keys partition by tenant,
 * principal and operation, and fail closed when any of them is missing.
 *
 * Segments are escaped and joined with `joinKeySegments` from
 * `@cqrs-ddd/safe-stringify`, so values
 * containing the separator — email addresses, external subject claims, composite
 * ids — cannot make two different operations collide on one key.
 *
 * The key is an operation identity. Do not fold permissions into it: a key that
 * changed with permissions would let the same side effect run again. Bind replay
 * to the caller's authorization with `replayScopeFactory` instead.
 *
 * The produced key is
 * `[version:]<tenantId>:<principal…>:<action>:<operation>`, with the tenant
 * segment omitted when `includeTenant` is `false`.
 *
 * @throws {MissingIdempotencyPartitionError} When the tenant or principal is
 * absent, or the operation is absent and `onMissingOperation` is `'throw'`.
 *
 * @example Per authenticated principal, deduplicated by a business identifier
 * ```ts
 * const createOrderKey = createPartitionedIdempotencyKeyFactory({
 *   version: 'v1',
 *   action: 'order.create',
 *   principal: (ctx) => ['user', ctx.items.get(CURRENT_USER_ID) as string],
 *   operation: (ctx) => (ctx.request as CreateOrderCommand).externalRef,
 * });
 *
 * @UsePipeline([IdempotencyBehavior, { keyFactory: createOrderKey }])
 * export class CreateOrderHandler {}
 * ```
 *
 * @example Optional client-supplied Idempotency-Key
 * ```ts
 * createPartitionedIdempotencyKeyFactory({
 *   principal: readUserId,
 *   operation: (ctx) => (ctx.request as PayCommand).idempotencyKey,
 *   onMissingOperation: 'skip',
 * });
 * ```
 */
export function createPartitionedIdempotencyKeyFactory(
  options: PartitionedIdempotencyKeyOptions & { onMissingOperation?: 'throw' },
): (context: IPipelineContext) => string;
export function createPartitionedIdempotencyKeyFactory(
  options: PartitionedIdempotencyKeyOptions,
): IdempotencyKeyFactory;
export function createPartitionedIdempotencyKeyFactory(
  options: PartitionedIdempotencyKeyOptions,
): IdempotencyKeyFactory {
  const includeTenant = options.includeTenant ?? true;
  const requireTenant = options.requireTenant ?? includeTenant;
  const onMissingOperation = options.onMissingOperation ?? 'throw';

  return (context) => {
    if (requireTenant && !context.tenantId) {
      throw new MissingIdempotencyPartitionError(
        context.requestName,
        'tenant',
        'Set a tenantIdFactory on PipelineModule, or pass requireTenant: false ' +
          'for a single-tenant deployment.',
      );
    }

    const principal = principalSegments(options.principal(context));
    if (!principal) {
      throw new MissingIdempotencyPartitionError(
        context.requestName,
        'principal',
        'Resolve the principal from authenticated context. There is no shared ' +
          'fallback: it would merge every unresolved caller into one namespace.',
      );
    }

    const operation = options.operation(context)?.trim();
    if (!operation) {
      if (onMissingOperation === 'skip') return undefined;
      throw new MissingIdempotencyPartitionError(
        context.requestName,
        'operation',
        "Return an operation identifier, or configure onMissingOperation: 'skip'.",
      );
    }

    return joinKeySegments([
      ...(options.version ? [options.version] : []),
      ...(includeTenant ? [context.tenantId] : []),
      ...principal,
      options.action ?? context.requestName,
      operation,
    ]);
  };
}

/** Normalizes a principal to non-empty trimmed segments, or `undefined`. */
function principalSegments(
  value: string | readonly string[] | undefined,
): string[] | undefined {
  const segments = (typeof value === 'string' ? [value] : (value ?? [])).map(
    (segment) => (typeof segment === 'string' ? segment.trim() : ''),
  );
  return segments.length > 0 && segments.every((segment) => segment !== '')
    ? segments
    : undefined;
}
