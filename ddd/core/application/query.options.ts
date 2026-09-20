/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Metadata understood by DDD query repositories and read-through cache helpers.
 *
 * Query implementations normally inherit this through {@link BaseQuery}.
 */
export interface IQueryOptions {
  /**
   * Request a hydrated domain object when a query repository supports snapshot
   * caching. {@link FromCache} uses this flag when `alwaysHydrate` is not set.
   *
   * @default false
   */
  hydrate?: boolean;

  /**
   * Bypass read-through cache lookup and fill, forcing an authoritative read
   * directly from underlying persistence.
   *
   * @default false
   */
  refresh?: boolean;
}
