/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getSessionPrincipal } from '@common/context/session-principal.store.js';
import { principalSegments } from '@common/types/session-principal.js';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import {
  createPartitionedIdempotencyKeyFactory,
  type IdempotencyKeyFactory,
} from '@nestjs-pipeline/idempotency';

/**
 * Namespace version for operation keys. Bump it only deliberately: a new
 * namespace abandons the deduplication claims stored under the previous one, so
 * an operation already completed can execute again until the old records expire.
 */
const OPERATION_KEY_VERSION = 'v1';

/**
 * Key factory for the client-chosen identity of one operation.
 *
 * `operationId` reads the `Idempotency-Key` the client sent: retries of one
 * operation carry the same value and replay its result, a new operation carries
 * a new value and runs. Without one the request is not deduplicated, and domain
 * invariants (such as a unique email) answer a duplicate. A business identifier
 * must not serve as the operation id: deleting and recreating that object would
 * replay the deleted object's creation.
 *
 * The key is `v1:<tenant>:<principalType>:<principalId>:<action>:<operationId>`,
 * each segment escaped, and fails closed when the tenant or the session
 * principal is missing. It carries nothing about permissions — an operation key
 * that changed when permissions changed would let the same side effect run a
 * second time. Bind replay to the caller's authorization with
 * `requireAbilityDigest` of `@nestjs-pipeline/casl` instead.
 *
 * @example
 * ```ts
 * idempotent({
 *   keyFactory: operationIdempotencyKeyFactory(
 *     'user.create',
 *     (ctx) => (ctx.request as CreateUserCommand).idempotencyKey,
 *   ),
 *   replayScopeFactory: requireAbilityDigest,
 * });
 * ```
 */
export function operationIdempotencyKeyFactory(
  action: string,
  operationId: (ctx: IPipelineContext) => string | undefined,
): IdempotencyKeyFactory {
  return createPartitionedIdempotencyKeyFactory({
    version: OPERATION_KEY_VERSION,
    action,
    principal: () => principalSegments(getSessionPrincipal()),
    operation: operationId,
    onMissingOperation: 'skip',
  });
}
