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

import { Module } from '@nestjs/common';
import { RolesController } from './controllers/roles.controller';
import { CreateRoleHandler } from './cqrs/commands/create-role.handler';
import { DeleteRoleHandler } from './cqrs/commands/delete-role.handler';
import { UpdateRoleHandler } from './cqrs/commands/update-role.handler';
import { RoleCreatedHandler } from './cqrs/events/role-created.handler';
import { RoleDeletedHandler } from './cqrs/events/role-deleted.handler';
import { RoleUpdatedHandler } from './cqrs/events/role-updated.handler';
import { GetRoleHandler } from './cqrs/queries/get-role.handler';
import { GetRolesHandler } from './cqrs/queries/get-roles.handler';
import { GetRolesCapabilitiesHandler } from './cqrs/queries/get-roles-capabilities.handler';
import { CreateRoleCommandRepository } from './persistence/create-role.command-repository';
import { DeleteRoleCommandRepository } from './persistence/delete-role.command-repository';
import { GetRoleQueryRepository } from './persistence/get-role.query-repository';
import { GetRolesQueryRepository } from './persistence/get-roles.query-repository';
import { GetRolesCapabilitiesQueryRepository } from './persistence/get-roles-capabilities.query-repository';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from './persistence/repository.tokens';
import { UpdateRoleCommandRepository } from './persistence/update-role.command-repository';

@Module({
  controllers: [RolesController],
  providers: [
    // Repositories (Command)
    {
      provide: COMMAND_REPOSITORY.createRole,
      useClass: CreateRoleCommandRepository,
    },
    {
      provide: COMMAND_REPOSITORY.updateRole,
      useClass: UpdateRoleCommandRepository,
    },
    {
      provide: COMMAND_REPOSITORY.deleteRole,
      useClass: DeleteRoleCommandRepository,
    },

    // Repositories (Query)
    { provide: QUERY_REPOSITORY.getRole, useClass: GetRoleQueryRepository },
    { provide: QUERY_REPOSITORY.getRoles, useClass: GetRolesQueryRepository },
    {
      provide: QUERY_REPOSITORY.getRolesCapabilities,
      useClass: GetRolesCapabilitiesQueryRepository,
    },

    // Queries
    GetRoleHandler,
    GetRolesHandler,
    GetRolesCapabilitiesHandler,

    // Commands
    CreateRoleHandler,
    UpdateRoleHandler,
    DeleteRoleHandler,

    // Events
    RoleCreatedHandler,
    RoleUpdatedHandler,
    RoleDeletedHandler,
  ],
})
export class RolesModule {}
