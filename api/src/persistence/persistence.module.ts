/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { CACHE_TOKEN } from '@cqrs-ddd/core/persistence';
import { MikroOrmCache } from '@cqrs-ddd/mikro-orm';
import { Global, Module } from '@nestjs/common';
import { mikroOrmCacheLogger } from './cache/cache-loggers';
import { TenantSchemaMiddleware } from './middlewares/tenant-schema.middleware';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from './mikro-orm.store';
import { persistenceConfig } from './persistence.config';
import { TenantSchemaContext } from './tenant-schema.context';

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
      provide: CACHE_TOKEN,
      useFactory: (store: MikroOrmStore) =>
        new MikroOrmCache(store, { logger: mikroOrmCacheLogger }),
      inject: [MIKRO_ORM_CLIENT],
    },
  ],
  exports: [
    MIKRO_ORM_CLIENT,
    CACHE_TOKEN,
    TenantSchemaContext,
    TenantSchemaMiddleware,
  ],
})
export class PersistenceModule {}
