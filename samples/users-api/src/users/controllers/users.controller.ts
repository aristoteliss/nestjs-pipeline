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
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateUserCommand } from '../cqrs/commands/create-user.command';
import { UpdateUserCommand } from '../cqrs/commands/update-user.command';
import { DeleteUserCommand } from '../cqrs/commands/delete-user.command';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { GetUsersQuery } from '../cqrs/queries/get-users.query';
import { UpdateUserDto, UpdateUserDtoSchema } from '../dtos/update-user.dto';
import { UserResponseDto, toResponseDto } from '../dtos/user.dto';
import { User } from '../domain/user.entity';
import { UserIdDto, UserIdDtoSchema } from '../dtos/get-user.dto';
import { CreateUserDto, CreateUserDtoSchema } from '../dtos/create-user.dto';
import { ZodPipe } from '@nestjs-pipeline/zod';
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
  async getUsers(
    @Req() _request: Request,
  ): Promise<{ users: UserResponseDto[] }> {
    const users = await this.queryBus.execute<GetUsersQuery, User[]>(new GetUsersQuery());
    return { users: users.map(toResponseDto) };
  }

  @Get(':id')
  @HttpCode(200)
  async getUser(
    @Param('id', new ZodPipe<UserIdDto, string>(UserIdDtoSchema)) id: UserIdDto,
  ): Promise<UserResponseDto> {
    const user = await this.queryBus.execute<GetUserQuery, User>(new GetUserQuery({ userId: id }));
    return toResponseDto(user);
  }

  @Post()
  @HttpCode(201)
  async createUser(
    @Body(new ZodPipe(CreateUserDtoSchema)) dto: CreateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.commandBus.execute<CreateUserCommand, User>(CreateUserMapper.map(dto));
    return toResponseDto(user);
  }

  @Patch(':id')
  @HttpCode(200)
  async updateUser(
    @Param('id', new ZodPipe<UserIdDto, string>(UserIdDtoSchema)) id: UserIdDto,
    @Body(new ZodPipe(UpdateUserDtoSchema)) dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.commandBus.execute<UpdateUserCommand, User>(UpdateUserMapper.map(id, dto));
    return toResponseDto(user);
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteUser(
    @Param('id', new ZodPipe<UserIdDto, string>(UserIdDtoSchema)) id: UserIdDto,
  ): Promise<void> {
    await this.commandBus.execute<DeleteUserCommand, void>(new DeleteUserCommand({ id }));
  }
}