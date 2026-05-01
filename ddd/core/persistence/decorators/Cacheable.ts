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

export function Cacheable<
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

      if (!result && deleteKeysFn) {
        for (const key of deleteKeysFn(domainOutcome)) {
          await this.cache.delete(key);
        }
        return null;
      }

      if (setKeyFn) {
        await this.cache.set(setKeyFn(domainOutcome), result);
      }

      return result;
    };
  };
}
