/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Metadata understood by DDD query repositories and read-through cache helpers.
 *
 * Query implementations normally inherit this through {@link BaseQuery}.
 */
export interface IQueryOptions {
  /**
   * Query metadata for repositories that read it. {@link FromCache} does not:
   * it rehydrates every hit whenever a hydrator applies.
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
