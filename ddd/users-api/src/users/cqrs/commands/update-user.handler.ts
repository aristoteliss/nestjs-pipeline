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
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { Inject, NotFoundException, Optional, Scope } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { PIPELINE_CACHE } from '@nestjs-pipeline/cache';
import {
  assertEntityPermission,
  CaslBehavior,
  getCaslAbility,
} from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
  IQueryRepository,
} from '@nestjs-pipeline/ddd-core';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { User } from '../../domain/models/user.entity';
import { UserUpdateOutcome } from '../../domain/outcomes/user-update.outcome';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from '../../repositories/repository.tokens';
import { GetUserQuery } from '../queries/get-user.query';
import { UpdateUserCommand } from './update-user.command';

// Example of using request-scoped handler if needed for per-request dependencies
@CommandHandler(UpdateUserCommand, { scope: Scope.REQUEST })
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [
    CaslBehavior,
    {
      subjectFromRequest: 'User',
      rules: [{ action: 'update', subject: 'User' }],
    },
  ],
)
export class UpdateUserHandler extends CommandBaseHandler<
  UpdateUserCommand,
  UserUpdateOutcome
> {
  constructor(
    @Inject(QUERY_REPOSITORY.getUser)
    private readonly queryRepository: IQueryRepository<GetUserQuery, User>,
    @Inject(COMMAND_REPOSITORY.updateUser)
    private readonly commandRepository: ICommandRepository<UserUpdateOutcome>,
    @Optional()
    @Inject(PIPELINE_CACHE)
    private readonly pipelineCache: {
      delete?: (key: string) => Promise<unknown>;
    } | null,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: UpdateUserCommand): Promise<UserUpdateOutcome> {
    const { id, username, department } = command;

    const query = new GetUserQuery({ userId: id }, { hydrate: true });

    const user = await this.queryRepository.find(query);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Entity-level authorization against the loaded target user. Conditions
    // like "User|update|{department: <mine>}" depend on the target's persisted
    // attributes, which the command payload does not carry, so they are
    // re-checked here against the real entity and the fields being changed.
    const ability = getCaslAbility();
    if (ability) {
      const changedFields = Object.entries({ username, department })
        .filter(([, value]) => value !== undefined)
        .map(([field]) => field);

      assertEntityPermission(ability, {
        action: 'update',
        subject: 'User',
        entity: user.toJSON() as unknown as Record<string, unknown>,
        fields: changedFields,
      });
    }

    const outcome = user.update({ username, department });

    await this.commandRepository.save(outcome);

    // Evict Redis cache entry for GetUserQuery
    if (this.pipelineCache) {
      const cacheKey = `${TenantSchemaContext.currentSchema}:GetUserQuery:${id}`;
      const c = this.pipelineCache as Record<string, unknown>;
      if (typeof c.del === 'function') {
        await (c.del as (k: string) => Promise<unknown>)(cacheKey);
      } else if (typeof c.delete === 'function') {
        await (c.delete as (k: string) => Promise<unknown>)(cacheKey);
      }
    }

    return outcome;
  }
}
