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

export * from './application/command-base.handler';
export * from './application/query.retrieve';
export * from './domain/decorators/Mutate';
export * from './domain/events/domain.event';
export * from './domain/events/root-domain.event';
export * from './domain/interfaces/cache-key.interface';
export * from './domain/interfaces/root-entity-snapshot.interface';
export * from './domain/models/cacheable.entity';
export * from './domain/models/root.entity';
export * from './domain/outcomes/domain.outcome';
export * from './domain/outcomes/root-domain.outcome';
export * from './persistence/cache.interface';
export * from './persistence/command-repository.abstract';
export * from './persistence/command-repository.interface';
export * from './persistence/decorators/Cache';
export * from './persistence/decorators/Cacheable';
export * from './persistence/query-repository.abstract';
export * from './persistence/query-repository.interface';
export * from './types/Method.type';
