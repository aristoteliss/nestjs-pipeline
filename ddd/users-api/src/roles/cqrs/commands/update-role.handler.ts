/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { Inject, Scope } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  IWriteSideAggregateRepository,
} from '@nestjs-pipeline/ddd-core/application';
import { EntityNotFoundException } from '@nestjs-pipeline/ddd-core/domain';
import { UniqueRoleNameException } from '../../domain/models/errors/role-name.exception';
import type { Role } from '../../domain/models/role.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { UpdateRoleCommand } from './update-role.command';

@CommandHandler(UpdateRoleCommand, { scope: Scope.REQUEST })
@UsePipeline(
  [
    LoggingBehavior,
    {
      requestResponseLogLevel: 'log',
      mapLogLevel: new Map([[UniqueRoleNameException, 'warn']]),
    },
  ],
  [
    CaslBehavior,
    { rules: [{ action: APP_ACTIONS.UPDATE, subject: APP_SUBJECTS.ROLE }] },
  ],
)
export class UpdateRoleHandler extends CommandBaseHandler<
  UpdateRoleCommand,
  Role
> {
  constructor(
    @Inject(COMMAND_REPOSITORY.updateRole)
    private readonly commandRepository: IWriteSideAggregateRepository<Role>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: UpdateRoleCommand): Promise<Role> {
    const role = await this.commandRepository.findById(command.id);
    if (!role) {
      throw new EntityNotFoundException('Role', command.id);
    }
    this.authorizer.authorize(
      'update',
      role,
      command.getUpdateFields(UpdateRoleCommand.MUTABLE_FIELDS),
    );
    role.rename(command.name);
    await this.commandRepository.save(role);
    return role;
  }
}
