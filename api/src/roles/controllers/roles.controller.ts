/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { HEADERS } from '@common/constants/headers.constants.js';
import { UnauthorizedActionException } from '@cqrs-ddd/pipeline-casl';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { z } from 'zod';
import { CreateRoleCommand } from '../application/cqrs/commands/create-role.command.js';
import { DeleteRoleCommand } from '../application/cqrs/commands/delete-role.command.js';
import { UpdateRoleCommand } from '../application/cqrs/commands/update-role.command.js';
import { GetRoleQuery } from '../application/cqrs/queries/get-role.query.js';
import { GetRolesQuery } from '../application/cqrs/queries/get-roles.query.js';
import type { RoleReadModel } from '../application/role-read-model.js';
import type { Role } from '../domain/models/role.entity.js';
import {
  type CreateRoleDto,
  CreateRoleDtoSchema,
} from '../dtos/create-role.dto.js';
import { type RoleIdDto, RoleIdDtoSchema } from '../dtos/get-role.dto.js';
import {
  RoleResponseBodySchema,
  type RoleResponseDto,
  toRoleResponseDto,
} from '../dtos/role.dto.js';
import {
  type UpdateRoleDto,
  UpdateRoleDtoSchema,
} from '../dtos/update-role.dto.js';
import { CreateRoleMapper } from '../mappers/create-role.mapper.js';
import { UpdateRoleMapper } from '../mappers/update-role.mapper.js';

@ApiBearerAuth()
@ApiSecurity({ 'api-id': [], 'api-key': [] })
@ApiCookieAuth()
@Controller('roles')
export class RolesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @HttpCode(200)
  @ApiOkResponse({
    description: 'The roles the caller may read.',
    standardSchema: z.object({ roles: z.array(RoleResponseBodySchema) }),
  })
  async getRoles(
    @Req() _request: Request,
  ): Promise<{ roles: RoleResponseDto[] }> {
    const roles = await this.queryBus.execute<GetRolesQuery, RoleReadModel[]>(
      new GetRolesQuery({}),
    );
    return { roles: roles.map(toRoleResponseDto) };
  }

  @Get(':id')
  @HttpCode(200)
  @ApiOkResponse({
    description: 'The role, without the fields the caller may not read.',
    standardSchema: RoleResponseBodySchema,
  })
  async getRole(
    @Param('id', { schema: RoleIdDtoSchema }) id: RoleIdDto,
  ): Promise<RoleResponseDto> {
    const query = new GetRoleQuery({ roleId: id }, { hydrate: false });
    const role = await this.queryBus.execute<
      GetRoleQuery,
      RoleReadModel | null
    >(query);
    return toRoleResponseDto(role);
  }

  @Post()
  @HttpCode(201)
  @ApiCreatedResponse({
    description: 'The created role, as far as the caller may read it.',
    standardSchema: RoleResponseBodySchema,
  })
  async createRole(
    @Body({ schema: CreateRoleDtoSchema }) dto: CreateRoleDto,
    @Headers(HEADERS.IDEMPOTENCY_KEY) idempotencyKey?: string,
  ): Promise<RoleResponseDto> {
    const { id } = await this.commandBus.execute<CreateRoleCommand, Role>(
      CreateRoleMapper.map(dto, idempotencyKey),
    );
    return this.readAfterWrite(id);
  }

  @Patch(':id')
  @HttpCode(200)
  @ApiOkResponse({
    description: 'The updated role, as far as the caller may read it.',
    standardSchema: RoleResponseBodySchema,
  })
  async updateRole(
    @Param('id', { schema: RoleIdDtoSchema }) id: RoleIdDto,
    @Body({ schema: UpdateRoleDtoSchema }) dto: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    await this.commandBus.execute<UpdateRoleCommand, Role>(
      UpdateRoleMapper.map(id, dto),
    );
    return this.readAfterWrite(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'The role is deleted.' })
  async deleteRole(
    @Param('id', { schema: RoleIdDtoSchema }) id: RoleIdDto,
  ): Promise<void> {
    await this.commandBus.execute<DeleteRoleCommand, Role>(
      new DeleteRoleCommand({ id }),
    );
  }

  /**
   * A committed write answers with what the caller may read afterwards: `{}`
   * when nothing is readable. Only a denial is absorbed; any other read
   * failure propagates even though the write has committed.
   */
  private async readAfterWrite(roleId: string): Promise<RoleResponseDto> {
    try {
      const role = await this.queryBus.execute<
        GetRoleQuery,
        RoleReadModel | null
      >(new GetRoleQuery({ roleId }));
      return role ? toRoleResponseDto(role) : {};
    } catch (error) {
      if (error instanceof UnauthorizedActionException) return {};
      throw error;
    }
  }
}
