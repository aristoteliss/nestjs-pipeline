/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IQueryOptions } from '../application/query.options';

export interface IQueryRepository<TQuery = IQueryOptions, TResult = unknown> {
  find(query: TQuery): Promise<TResult>;
}
