/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { TENANT_CONTEXT } from '@common/context/tenant-context.port';
import { Global, Module } from '@nestjs/common';
import { CACHE_TOKEN } from '@nestjs-pipeline/ddd-core';
import { MikroOrmCache } from './cache/mikro-orm.cache';
import { TenantSchemaMiddleware } from './middlewares/tenant-schema.middleware';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from './mikro-orm.store';
import { PostgresMikroOrmStore } from './postgres-mikro-orm.store';
import { TenantSchemaContext } from './tenant-schema.context';

const isPostgres = process.env.DB_ENGINE === 'postgres';
const SelectedMikroOrmStore = isPostgres
  ? PostgresMikroOrmStore
  : MikroOrmStore;

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
        new TenantSchemaMiddleware(tenantSchemaContext),
      inject: [TenantSchemaContext],
    },
    {
      provide: MIKRO_ORM_CLIENT,
      useExisting: SelectedMikroOrmStore,
    },
    { provide: CACHE_TOKEN, useClass: MikroOrmCache },
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
