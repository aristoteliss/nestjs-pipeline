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

/**
 * Contract for write-side command repositories.
 *
 * Persists an entity or aggregate state into persistence storage.
 *
 * @typeParam TEntity - The aggregate entity or payload being persisted.
 * @typeParam TResult - The result type returned after persistence (or null on deletion).
 */
export interface ICommandRepository<TEntity = unknown, TResult = unknown> {
  save(entity: TEntity): Promise<TResult | null>;
}
