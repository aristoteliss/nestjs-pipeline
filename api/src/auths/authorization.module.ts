/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Module } from '@nestjs/common';
import { CaslPermissionSource } from './persistence/casl-permission.source.js';
import { GetUserPermissionRulesRepository } from './persistence/get-user-permission-rules.query-repository.js';
import { QUERY_REPOSITORY } from './persistence/repository.tokens.js';
import { UserPermissionsProjector } from './persistence/user-permissions.projector.js';

/**
 * Provides the permission source `CaslModule` binds to `CASL_PERMISSION_SOURCE`,
 * the ordered rule read shared with token issuing, and the projector every
 * writer of permission inputs must call.
 */
@Module({
  providers: [
    CaslPermissionSource,
    UserPermissionsProjector,
    GetUserPermissionRulesRepository,
    {
      provide: QUERY_REPOSITORY.getUserPermissionRules,
      useExisting: GetUserPermissionRulesRepository,
    },
  ],
  exports: [
    CaslPermissionSource,
    UserPermissionsProjector,
    GetUserPermissionRulesRepository,
    QUERY_REPOSITORY.getUserPermissionRules,
  ],
})
export class AuthorizationModule {}
