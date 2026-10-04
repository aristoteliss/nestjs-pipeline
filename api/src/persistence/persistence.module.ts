/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MikroOrmCache } from '@cqrs-ddd/mikro-orm';
import { Global, Module } from '@nestjs/common';
import { CACHE } from '@persistence/cache/cache.token.js';
import { mikroOrmCacheLogger } from './cache/cache-loggers.js';
import { TenantSchemaMiddleware } from './middlewares/tenant-schema.middleware.js';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from './mikro-orm.store.js';
import { persistenceConfig } from './persistence.config.js';
import { TenantSchemaContext } from './tenant-schema.context.js';

@Global()
@Module({
  providers: [
    TenantSchemaContext,
    MikroOrmStore,
    {
      provide: TenantSchemaMiddleware,
      useFactory: (tenantSchemaContext: TenantSchemaContext) =>
        new TenantSchemaMiddleware(
          tenantSchemaContext,
          new Set(persistenceConfig().tenants),
        ),
      inject: [TenantSchemaContext],
    },
    {
      provide: MIKRO_ORM_CLIENT,
      useExisting: MikroOrmStore,
    },
    {
      provide: CACHE,
      useFactory: (store: MikroOrmStore) =>
        new MikroOrmCache(store, { logger: mikroOrmCacheLogger }),
      inject: [MIKRO_ORM_CLIENT],
    },
  ],
  exports: [
    MIKRO_ORM_CLIENT,
    CACHE,
    TenantSchemaContext,
    TenantSchemaMiddleware,
  ],
})
export class PersistenceModule {}
