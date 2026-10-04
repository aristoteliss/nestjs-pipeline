/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { CaslAuthorizer, CaslBehavior } from '@cqrs-ddd/pipeline-casl';
import { Global, Module } from '@nestjs/common';
import { CaslPermissionSource } from './persistence/casl-permission.source.js';
import { GetUserPermissionRulesRepository } from './persistence/get-user-permission-rules.query-repository.js';
import { QUERY_REPOSITORY } from './persistence/repository.tokens.js';
import { UserPermissionsProjector } from './persistence/user-permissions.projector.js';

/**
 * Provides `CaslBehavior` on the application's permission source, the
 * `CaslAuthorizer` handlers use for entity- and field-level checks, the ordered
 * rule read shared with token issuing, and the projector every writer of
 * permission inputs must call. It is global, so every feature module's
 * handlers reach `CaslAuthorizer`.
 */
@Global()
@Module({
  providers: [
    CaslPermissionSource,
    {
      provide: CaslBehavior,
      inject: [CaslPermissionSource],
      useFactory: (source: CaslPermissionSource) => new CaslBehavior(source),
    },
    { provide: CaslAuthorizer, useFactory: () => new CaslAuthorizer() },
    UserPermissionsProjector,
    GetUserPermissionRulesRepository,
    {
      provide: QUERY_REPOSITORY.getUserPermissionRules,
      useExisting: GetUserPermissionRulesRepository,
    },
  ],
  exports: [
    CaslAuthorizer,
    CaslPermissionSource,
    UserPermissionsProjector,
    GetUserPermissionRulesRepository,
    QUERY_REPOSITORY.getUserPermissionRules,
  ],
})
export class AuthorizationModule {}
