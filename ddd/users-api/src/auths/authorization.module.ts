/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Module } from '@nestjs/common';
import { USER_PERMISSION_RULES } from './application/ports/user-permission-rules.port';
import { CaslPermissionSource } from './persistence/casl-permission.source';
import { UserPermissionRulesReader } from './persistence/user-permission-rules.reader';
import { UserPermissionsProjector } from './persistence/user-permissions.projector';

/**
 * Provides the permission source `CaslModule` binds to `CASL_PERMISSION_SOURCE`,
 * the ordered rule read shared with token issuing, and the projector every
 * writer of permission inputs must call.
 */
@Module({
  providers: [
    CaslPermissionSource,
    UserPermissionsProjector,
    { provide: USER_PERMISSION_RULES, useClass: UserPermissionRulesReader },
  ],
  exports: [
    CaslPermissionSource,
    UserPermissionsProjector,
    USER_PERMISSION_RULES,
  ],
})
export class AuthorizationModule {}
