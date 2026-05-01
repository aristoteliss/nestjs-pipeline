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

import { Global, Module } from '@nestjs/common';
import { CACHE_TOKEN } from './cache/memory.cache';
import { MikroOrmCache } from './cache/mikro-orm.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from './mikro-orm.store';

@Global()
@Module({
  providers: [
    MikroOrmStore,
    {
      provide: MIKRO_ORM_CLIENT,
      useFactory: (store: MikroOrmStore) => store,
      inject: [MikroOrmStore],
    },
    { provide: CACHE_TOKEN, useClass: MikroOrmCache },
  ],
  exports: [MIKRO_ORM_CLIENT, CACHE_TOKEN],
})
export class PersistenceModule { }
