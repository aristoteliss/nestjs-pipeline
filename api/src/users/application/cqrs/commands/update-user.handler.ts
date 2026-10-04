/* Copyright (C) 2026-present Aristotelis — see repository license. */
import {
  APP_ACTIONS,
  APP_SUBJECTS,
  AUDIT_ACTIONS,
} from '@common/constants/index.js';
import { IWriteSideAggregateRepository } from '@cqrs-ddd/core/application';
import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import { type IPipelineContext, UsePipeline } from '@cqrs-ddd/pipeline';
import { AUDIT_SEVERITY, audit } from '@cqrs-ddd/pipeline-audit';
import { CaslAuthorizer, requires } from '@cqrs-ddd/pipeline-casl';
import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
} from '@nestjs/cqrs';
import type { User } from '../../../domain/models/user.entity.js';
import { COMMAND_REPOSITORY } from '../../../persistence/repository.tokens.js';
import { UpdateUserCommand } from './update-user.command.js';

@CommandHandler(UpdateUserCommand)
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
export class UpdateUserHandler
  implements ICommandHandler<UpdateUserCommand, User>
{
  constructor(
    @Inject(COMMAND_REPOSITORY.updateUser)
    private readonly commandRepository: IWriteSideAggregateRepository<User>,
    private readonly authorizer: CaslAuthorizer,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: UpdateUserCommand): Promise<User> {
    const { id, username, department } = command;
    const user = await this.commandRepository.findById(id);
    if (!user) {
      throw new EntityNotFoundException('User', id);
    }

    this.authorizer.authorize(
      'update',
      user,
      command.getUpdateFields(UpdateUserCommand.updatableFields),
    );
    user.update({ username, department });
    await this.commandRepository.save(user);
    await this.publisher.mergeObjectContext(user).commit();
    return user;
  }
}
