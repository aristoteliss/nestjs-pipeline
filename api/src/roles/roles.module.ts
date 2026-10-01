/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Module } from '@nestjs/common';
import { CreateRoleHandler } from './application/cqrs/commands/create-role.handler.js';
import { DeleteRoleHandler } from './application/cqrs/commands/delete-role.handler.js';
import { UpdateRoleHandler } from './application/cqrs/commands/update-role.handler.js';
import { GetRoleHandler } from './application/cqrs/queries/get-role.handler.js';
import { GetRolesHandler } from './application/cqrs/queries/get-roles.handler.js';
import { RolesController } from './controllers/roles.controller.js';
import { CreateRoleCommandRepository } from './persistence/create-role.command-repository.js';
import { DeleteRoleCommandRepository } from './persistence/delete-role.command-repository.js';
import { GetRoleQueryRepository } from './persistence/get-role.query-repository.js';
import { GetRolesQueryRepository } from './persistence/get-roles.query-repository.js';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from './persistence/repository.tokens.js';
import { UpdateRoleCommandRepository } from './persistence/update-role.command-repository.js';

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

    // Queries
    GetRoleHandler,
    GetRolesHandler,

    // Commands
    CreateRoleHandler,
    UpdateRoleHandler,
    DeleteRoleHandler,
  ],
  exports: [
    { provide: QUERY_REPOSITORY.getRoles, useClass: GetRolesQueryRepository },
  ],
})
export class RolesModule {}
