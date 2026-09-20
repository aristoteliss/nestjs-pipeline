/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { UnauthorizedActionException } from '@nestjs-pipeline/casl';
import { ZodPipe } from '@nestjs-pipeline/zod';
import type { UserReadModel } from '../application/user-read-model';
import { CreateUserCommand } from '../cqrs/commands/create-user.command';
import { DeleteUserCommand } from '../cqrs/commands/delete-user.command';
import { UpdateUserCommand } from '../cqrs/commands/update-user.command';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import type { UserOverviewDto } from '../cqrs/queries/get-user-overview.handler';
import { GetUserOverviewQuery } from '../cqrs/queries/get-user-overview.query';
import { GetUsersQuery } from '../cqrs/queries/get-users.query';
import type { User } from '../domain/models/user.entity';
import {
  type CreateUserDto,
  CreateUserDtoSchema,
} from '../dtos/create-user.dto';
import { type UserIdDto, UserIdDtoSchema } from '../dtos/get-userId.dto';
import {
  type UpdateUserDto,
  UpdateUserDtoSchema,
} from '../dtos/update-user.dto';
import { toResponseDto, type UserResponseDto } from '../dtos/user.dto';
import { CreateUserMapper } from '../mappers/create-user.mapper';
import { UpdateUserMapper } from '../mappers/update-user.mapper';

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
    @Param('id', new ZodPipe<UserIdDto, string>(UserIdDtoSchema)) id: UserIdDto,
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
    @Param('id', new ZodPipe<UserIdDto, string>(UserIdDtoSchema)) id: UserIdDto,
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
    @Body(new ZodPipe(CreateUserDtoSchema)) dto: CreateUserDto,
  ): Promise<UserResponseDto> {
    const { id } = await this.commandBus.execute<CreateUserCommand, User>(
      CreateUserMapper.map(dto),
    );
    return this.readAfterWrite(id);
  }

  @Patch(':id')
  @HttpCode(200)
  async updateUser(
    @Param('id', new ZodPipe<UserIdDto, string>(UserIdDtoSchema)) id: UserIdDto,
    @Body(new ZodPipe(UpdateUserDtoSchema)) dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    await this.commandBus.execute<UpdateUserCommand, User>(
      UpdateUserMapper.map(id, dto),
    );
    return this.readAfterWrite(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteUser(
    @Param('id', new ZodPipe<UserIdDto, string>(UserIdDtoSchema)) id: UserIdDto,
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
