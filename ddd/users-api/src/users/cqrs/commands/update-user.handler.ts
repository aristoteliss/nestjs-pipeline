/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, APP_SUBJECTS, AUDIT_ACTIONS } from '@common/constants';
import { Inject, Scope } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, audit } from '@nestjs-pipeline/audit';
import { CaslAuthorizer, requires } from '@nestjs-pipeline/casl';
import { type IPipelineContext, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  IWriteSideAggregateRepository,
} from '@nestjs-pipeline/ddd-core/application';
import { EntityNotFoundException } from '@nestjs-pipeline/ddd-core/domain';
import type { User } from '../../domain/models/user.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { UpdateUserCommand } from './update-user.command';

@CommandHandler(UpdateUserCommand, { scope: Scope.REQUEST })
@UsePipeline(
  requires({ action: APP_ACTIONS.UPDATE, subject: APP_SUBJECTS.USER }),
  audit({
    action: AUDIT_ACTIONS.USER_UPDATE,
    severity: AUDIT_SEVERITY.MEDIUM,
    metadata: (ctx: IPipelineContext) => {
      const cmd = ctx.request as UpdateUserCommand | undefined;
      return cmd?.id ? { targetUserId: cmd.id } : {};
    },
  }),
)
export class UpdateUserHandler extends CommandBaseHandler<
  UpdateUserCommand,
  User
> {
  constructor(
    @Inject(COMMAND_REPOSITORY.updateUser)
    private readonly commandRepository: IWriteSideAggregateRepository<User>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: UpdateUserCommand): Promise<User> {
    const { id, username, department } = command;
    const user = await this.commandRepository.findById(id);
    if (!user) {
      throw new EntityNotFoundException('User', id);
    }

    this.authorizer.authorize(
      'update',
      user,
      command.getUpdateFields(UpdateUserCommand.MUTABLE_FIELDS),
    );
    user.update({ username, department });
    await this.commandRepository.save(user);
    return user;
  }
}
