/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
import { UnauthorizedActionException } from '@nestjs-pipeline/casl';
import { ZodPipe } from '@nestjs-pipeline/zod';
import type { RoleReadModel } from '../application/role-read-model';
import { CreateRoleCommand } from '../cqrs/commands/create-role.command';
import { DeleteRoleCommand } from '../cqrs/commands/delete-role.command';
import { UpdateRoleCommand } from '../cqrs/commands/update-role.command';
import { GetRoleQuery } from '../cqrs/queries/get-role.query';
import { GetRolesQuery } from '../cqrs/queries/get-roles.query';
import type { Role } from '../domain/models/role.entity';
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
    const roles = await this.queryBus.execute<GetRolesQuery, RoleReadModel[]>(
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
    const role = await this.queryBus.execute<
      GetRoleQuery,
      RoleReadModel | null
    >(query);
    return toRoleResponseDto(role);
  }

  @Post()
  @HttpCode(201)
  async createRole(
    @Body(new ZodPipe(CreateRoleDtoSchema)) dto: CreateRoleDto,
  ): Promise<RoleResponseDto> {
    const { id } = await this.commandBus.execute<CreateRoleCommand, Role>(
      CreateRoleMapper.map(dto),
    );
    return this.readAfterWrite(id);
  }

  @Patch(':id')
  @HttpCode(200)
  async updateRole(
    @Param('id', new ZodPipe<RoleIdDto, string>(RoleIdDtoSchema)) id: RoleIdDto,
    @Body(new ZodPipe(UpdateRoleDtoSchema)) dto: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    await this.commandBus.execute<UpdateRoleCommand, Role>(
      UpdateRoleMapper.map(id, dto),
    );
    return this.readAfterWrite(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteRole(
    @Param('id', new ZodPipe<RoleIdDto, string>(RoleIdDtoSchema)) id: RoleIdDto,
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
