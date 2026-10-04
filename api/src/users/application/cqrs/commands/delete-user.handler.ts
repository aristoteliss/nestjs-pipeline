/* Copyright (C) 2026-present Aristotelis — see repository license. */
import {
  APP_ACTIONS,
  APP_SUBJECTS,
  AUDIT_ACTIONS,
} from '@common/constants/index.js';
import { IWriteSideAggregateRepository } from '@cqrs-ddd/core/application';
import {
  EntityNotFoundException,
  isTransientOperationError,
} from '@cqrs-ddd/core/domain';
import { type IPipelineContext, UsePipeline } from '@cqrs-ddd/pipeline';
import { AUDIT_SEVERITY, audit } from '@cqrs-ddd/pipeline-audit';
import { CaslAuthorizer, requires } from '@cqrs-ddd/pipeline-casl';
import { resilience } from '@cqrs-ddd/pipeline-resilience';
import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
} from '@nestjs/cqrs';
import type { User } from '../../../domain/models/user.entity.js';
import { COMMAND_REPOSITORY } from '../../../persistence/repository.tokens.js';
import { DeleteUserCommand } from './delete-user.command.js';

@CommandHandler(DeleteUserCommand)
@UsePipeline(
  requires({ action: APP_ACTIONS.DELETE, subject: APP_SUBJECTS.USER }),
  audit({
    action: AUDIT_ACTIONS.USER_DELETE,
    severity: AUDIT_SEVERITY.HIGH,
    metadata: (ctx: IPipelineContext) => {
      const cmd = ctx.request as DeleteUserCommand | undefined;
      return cmd?.id ? { targetUserId: cmd.id } : {};
    },
  }),
  resilience({
    handle: isTransientOperationError,
    retry: {
      maxAttempts: 3,
      replaySafe: true,
      backoff: {
        type: 'exponential',
        initialDelay: 25,
        maxDelay: 100,
      },
    },
  }),
)
export class DeleteUserHandler
  implements ICommandHandler<DeleteUserCommand, User>
{
  constructor(
    @Inject(COMMAND_REPOSITORY.deleteUser)
    private readonly commandRepository: IWriteSideAggregateRepository<User>,
    private readonly authorizer: CaslAuthorizer,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: DeleteUserCommand): Promise<User> {
    const user = await this.commandRepository.findById(command.id);
    if (!user) {
      throw new EntityNotFoundException('User', command.id);
    }
    this.authorizer.authorize('delete', user);
    user.delete();
    await this.commandRepository.save(user);
    await this.publisher.mergeObjectContext(user).commit();
    return user;
  }
}
