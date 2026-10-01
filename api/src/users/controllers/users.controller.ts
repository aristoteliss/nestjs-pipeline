/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { HEADERS } from '@common/constants/headers.constants.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { UnauthorizedActionException } from '@nestjs-pipeline/casl';
import { CreateUserCommand } from '../application/cqrs/commands/create-user.command.js';
import { DeleteUserCommand } from '../application/cqrs/commands/delete-user.command.js';
import { UpdateUserCommand } from '../application/cqrs/commands/update-user.command.js';
import { GetUserQuery } from '../application/cqrs/queries/get-user.query.js';
import type { UserOverviewDto } from '../application/cqrs/queries/get-user-overview.handler.js';
import { GetUserOverviewQuery } from '../application/cqrs/queries/get-user-overview.query.js';
import { GetUsersQuery } from '../application/cqrs/queries/get-users.query.js';
import type { UserReadModel } from '../application/user-read-model.js';
import type { User } from '../domain/models/user.entity.js';
import {
  type CreateUserDto,
  CreateUserDtoSchema,
} from '../dtos/create-user.dto.js';
import { type UserIdDto, UserIdDtoSchema } from '../dtos/get-userId.dto.js';
import {
  type UpdateUserDto,
  UpdateUserDtoSchema,
} from '../dtos/update-user.dto.js';
import { toResponseDto, type UserResponseDto } from '../dtos/user.dto.js';
import { CreateUserMapper } from '../mappers/create-user.mapper.js';
import { UpdateUserMapper } from '../mappers/update-user.mapper.js';

@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @HttpCode(200)
  async getUsers(): Promise<{ users: UserResponseDto[] }> {
    const users = await this.queryBus.execute<GetUsersQuery, UserReadModel[]>(
      new GetUsersQuery({}),
    );
    return { users: users.map(toResponseDto) };
  }

  @Get(':id')
  @HttpCode(200)
  async getUser(
    @Param('id', { schema: UserIdDtoSchema }) id: UserIdDto,
  ): Promise<UserResponseDto> {
    const query = new GetUserQuery({ userId: id }, { hydrate: true });

    const user = await this.queryBus.execute<
      GetUserQuery,
      UserReadModel | null
    >(query);

    return toResponseDto(user);
  }

  @Get(':id/overview')
  @HttpCode(200)
  async getUserOverview(
    @Param('id', { schema: UserIdDtoSchema }) id: UserIdDto,
  ): Promise<UserOverviewDto> {
    const overview = await this.queryBus.execute<
      GetUserOverviewQuery,
      UserOverviewDto | null
    >(new GetUserOverviewQuery({ userId: id }));

    if (!overview) {
      throw new NotFoundException('User not found');
    }

    return overview;
  }

  @Post()
  @HttpCode(201)
  async createUser(
    @Body({ schema: CreateUserDtoSchema }) dto: CreateUserDto,
    @Headers(HEADERS.IDEMPOTENCY_KEY) idempotencyKey?: string,
  ): Promise<UserResponseDto> {
    const { id } = await this.commandBus.execute<CreateUserCommand, User>(
      CreateUserMapper.map(dto, idempotencyKey),
    );
    return this.readAfterWrite(id);
  }

  @Patch(':id')
  @HttpCode(200)
  async updateUser(
    @Param('id', { schema: UserIdDtoSchema }) id: UserIdDto,
    @Body({ schema: UpdateUserDtoSchema }) dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    await this.commandBus.execute<UpdateUserCommand, User>(
      UpdateUserMapper.map(id, dto),
    );
    return this.readAfterWrite(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteUser(
    @Param('id', { schema: UserIdDtoSchema }) id: UserIdDto,
  ): Promise<void> {
    await this.commandBus.execute<DeleteUserCommand, User>(
      new DeleteUserCommand({ id }),
    );
  }

  /**
   * A committed write answers with what the caller may read afterwards: `{}`
   * when nothing is readable. Only a denial is absorbed; any other read
   * failure propagates even though the write has committed.
   */
  private async readAfterWrite(userId: string): Promise<UserResponseDto> {
    try {
      const user = await this.queryBus.execute<
        GetUserQuery,
        UserReadModel | null
      >(new GetUserQuery({ userId }));
      return user ? toResponseDto(user) : {};
    } catch (error) {
      if (error instanceof UnauthorizedActionException) return {};
      throw error;
    }
  }
}
