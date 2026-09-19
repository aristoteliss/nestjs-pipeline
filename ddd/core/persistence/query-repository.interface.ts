/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IQueryOptions } from '../application/query.options';

/**
 * Application-facing read repository contract.
 *
 * Query handlers depend on this interface rather than ORM/query-builder
 * implementations. Repository adapters may use {@link FromCache} internally,
 * but callers receive only the declared `TResult`.
 *
 * @typeParam TQuery - Query object accepted by {@link find}.
 * @typeParam TResult - Domain/read result returned to the application layer.
 *
 * @example
 * ```ts
 * constructor(
 *   @Inject(QUERY_REPOSITORY.getUser)
 *   private readonly users: IQueryRepository<GetUserQuery, User | null>,
 * ) {}
 *
 * const user = await this.users.find(query);
 * ```
 */
export interface IQueryRepository<TQuery = IQueryOptions, TResult = unknown> {
  /** Resolves one application query. */
  find(query: TQuery): Promise<TResult>;
}
