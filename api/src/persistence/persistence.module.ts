/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { TENANT_CONTEXT } from '@common/context/tenant-context.port';
import { CACHE_TOKEN } from '@cqrs-ddd/core/persistence';
import { MikroOrmCache } from '@cqrs-ddd/mikro-orm';
import { Global, Module } from '@nestjs/common';
import { mikroOrmCacheLogger } from './cache/cache-loggers';
import { TenantSchemaMiddleware } from './middlewares/tenant-schema.middleware';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from './mikro-orm.store';
import { persistenceConfig } from './persistence.config';
import { PostgresMikroOrmStore } from './postgres-mikro-orm.store';
import { TenantSchemaContext } from './tenant-schema.context';

const config = persistenceConfig();
const SelectedMikroOrmStore =
  config.engine === 'postgres' ? PostgresMikroOrmStore : MikroOrmStore;

@Global()
@Module({
  providers: [
    TenantSchemaContext,
    {
      provide: TENANT_CONTEXT,
      useExisting: TenantSchemaContext,
    },
    SelectedMikroOrmStore,
    {
      provide: TenantSchemaMiddleware,
      useFactory: (tenantSchemaContext: TenantSchemaContext) =>
        new TenantSchemaMiddleware(
          tenantSchemaContext,
          new Set(config.tenants),
        ),
      inject: [TenantSchemaContext],
    },
    {
      provide: MIKRO_ORM_CLIENT,
      useExisting: SelectedMikroOrmStore,
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
    TENANT_CONTEXT,
    TenantSchemaContext,
    TenantSchemaMiddleware,
  ],
})
export class PersistenceModule {}
