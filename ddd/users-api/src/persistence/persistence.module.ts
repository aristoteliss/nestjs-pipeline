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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */

import { createClient } from '@libsql/client';
import { Global, Module } from '@nestjs/common';
import { CACHE_TOKEN } from './cache/memory.cache';
import { TursoCache } from './cache/turso.cache';
import { TURSO_CLIENT, TursoStore } from './turso-store';

@Global()
@Module({
  providers: [
    {
      provide: TURSO_CLIENT,
      useFactory: () =>
        createClient({
          url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
          authToken: process.env.TURSO_AUTH_TOKEN,
        }),
    },
    TursoStore,
    { provide: CACHE_TOKEN, useClass: TursoCache },
  ],
  exports: [TURSO_CLIENT, CACHE_TOKEN],
})
export class PersistenceModule {}
