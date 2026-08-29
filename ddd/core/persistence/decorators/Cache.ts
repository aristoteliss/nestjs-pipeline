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

import { RootDomainOutcome } from '../../domain/outcomes/root-domain.outcome';
import type { CommandRepository } from '../command-repository.abstract';

/**
 * Write-through cache decorator for a {@link CommandRepository} `save` method.
 *
 * After the original save runs: if it returns a result, the entry is written
 * under the key from `setKeyFn`; if it returns `null` or `undefined` (e.g. a
 * delete or a void save), the keys from `deleteKeysFn` are evicted. By default
 * both derive from the outcome entity's `cacheKey`. If the repository has no
 * cache, the call passes through.
 *
 * @param setKeyFn - Builds the key to write on a successful save, or `null` to skip writing.
 * @param deleteKeysFn - Builds the keys to evict when the save yields `null` or `undefined`, or `null` to skip eviction.
 */
export function Cache<
  TDomainOutcome extends RootDomainOutcome,
  TResult = unknown | null,
>(
  setKeyFn: ((domainOutcome: TDomainOutcome) => string) | null = (outcome) =>
    outcome.entity.cacheKey,
  deleteKeysFn: ((domainOutcome: TDomainOutcome) => string[]) | null = (
    outcome,
  ) => [outcome.entity.cacheKey],
): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const original = descriptor.value as (
      domainOutcome: TDomainOutcome,
    ) => Promise<TResult | null>;

    descriptor.value = async function (
      this: CommandRepository<TDomainOutcome, unknown | null>,
      domainOutcome: TDomainOutcome,
    ): Promise<TResult | null> {
      const result = await original.call(this, domainOutcome);

      if (!this.cache) {
        return result;
      }

      // Cache maintenance is best-effort: the DB write already succeeded,
      // so a cache failure must not turn a success into an error (which
      // would cause idempotency release-on-error to drop the claim).
      if (result === null || result === undefined) {
        if (deleteKeysFn) {
          for (const key of deleteKeysFn(domainOutcome)) {
            try {
              await this.cache.delete(key);
            } catch {
              /* best-effort */
            }
          }
        }
        return result;
      }

      if (setKeyFn) {
        try {
          await this.cache.set(setKeyFn(domainOutcome), result);
        } catch {
          /* best-effort */
        }
      }

      return result;
    };
  };
}
