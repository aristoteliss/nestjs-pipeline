/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Injection token of the repositories' snapshot cache, an `ICache` of
 * `@cqrs-ddd/core` that `PersistenceModule` provides.
 */
export const CACHE = Symbol('CACHE');
