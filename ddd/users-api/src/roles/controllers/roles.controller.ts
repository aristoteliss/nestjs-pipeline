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

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ZodPipe } from '@nestjs-pipeline/zod';
import { CreateRoleCommand } from '../cqrs/commands/create-role.command';
import { DeleteRoleCommand } from '../cqrs/commands/delete-role.command';
import { UpdateRoleCommand } from '../cqrs/commands/update-role.command';
import { GetRoleQuery } from '../cqrs/queries/get-role.query';
import { GetRolesQuery } from '../cqrs/queries/get-roles.query';
import { Role } from '../domain/models/role.entity';
import { RoleCreateOutcome } from '../domain/outcomes/role-create.outcome';
import { RoleUpdateOutcome } from '../domain/outcomes/role-update.outcome';
import {
  type CreateRoleDto,
  CreateRoleDtoSchema,
} from '../dtos/create-role.dto';
import { type RoleIdDto, RoleIdDtoSchema } from '../dtos/get-role.dto';
import { type RoleResponseDto, toRoleResponseDto } from '../dtos/role.dto';
import {
  type UpdateRoleDto,
  UpdateRoleDtoSchema,
} from '../dtos/update-role.dto';
import { CreateRoleMapper } from '../mappers/create-role.mapper';
import { UpdateRoleMapper } from '../mappers/update-role.mapper';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @HttpCode(200)
  async getRoles(
    @Req() _request: Request,
  ): Promise<{ roles: RoleResponseDto[] }> {
    const roles = await this.queryBus.execute<GetRolesQuery, Role[]>(
      new GetRolesQuery({}),
    );
    return { roles: roles.map(toRoleResponseDto) };
  }

  @Get(':id')
  @HttpCode(200)
  async getRole(
    @Param('id', new ZodPipe<RoleIdDto, string>(RoleIdDtoSchema)) id: RoleIdDto,
  ): Promise<RoleResponseDto> {
    const query = new GetRoleQuery({ roleId: id }, { hydrate: false });
    const role = await this.queryBus.execute<GetRoleQuery, Role>(query);
    return toRoleResponseDto(role);
  }

  @Post()
  @HttpCode(201)
  async createRole(
    @Body(new ZodPipe(CreateRoleDtoSchema)) dto: CreateRoleDto,
  ): Promise<RoleResponseDto> {
    const outcome = await this.commandBus.execute<
      CreateRoleCommand,
      RoleCreateOutcome
    >(CreateRoleMapper.map(dto));
    return toRoleResponseDto(outcome.entity);
  }

  @Patch(':id')
  @HttpCode(200)
  async updateRole(
    @Param('id', new ZodPipe<RoleIdDto, string>(RoleIdDtoSchema)) id: RoleIdDto,
    @Body(new ZodPipe(UpdateRoleDtoSchema)) dto: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    const outcome = await this.commandBus.execute<
      UpdateRoleCommand,
      RoleUpdateOutcome
    >(UpdateRoleMapper.map(id, dto));
    return toRoleResponseDto(outcome.entity);
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteRole(
    @Param('id', new ZodPipe<RoleIdDto, string>(RoleIdDtoSchema)) id: RoleIdDto,
  ): Promise<void> {
    await this.commandBus.execute<DeleteRoleCommand, RoleUpdateOutcome>(
      new DeleteRoleCommand({ id }),
    );
  }
}
