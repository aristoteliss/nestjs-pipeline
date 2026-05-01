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

import { RootDomainOutcome } from '../domain/outcomes/root-domain.outcome';
import { ICache } from './cache.interface';
import { ICommandRepository } from './command-repository.interface';

export abstract class CommandRepository<
  TDomainOutcome = RootDomainOutcome,
  TResult = unknown | null,
> implements ICommandRepository<TDomainOutcome, TResult> {
  constructor(protected readonly cache: ICache<TResult>) { }

  abstract save(domainOutcome: TDomainOutcome): Promise<TResult | null>;
}
