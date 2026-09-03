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

import {
  Global,
  Inject,
  Module,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import {
  ENTITY_AUTHORIZER,
  type IEntityAuthorizer,
} from './domain/interfaces/authorize-entity.interface';
import { RootEntity } from './domain/models/root.entity';

/**
 * Global NestJS module for DDD core primitives.
 *
 * Resolves the optional `ENTITY_AUTHORIZER` from NestJS dependency injection
 * (e.g. provided by `CaslModule`) and registers it on `RootEntity.defaultAuthorizer`
 * at module initialization time.
 */
@Global()
@Module({})
export class DddCoreModule implements OnModuleInit {
  constructor(
    @Optional()
    @Inject(ENTITY_AUTHORIZER)
    private readonly authorizer?: IEntityAuthorizer,
  ) {}

  onModuleInit(): void {
    if (this.authorizer) {
      RootEntity.defaultAuthorizer = this.authorizer;
    }
  }
}
