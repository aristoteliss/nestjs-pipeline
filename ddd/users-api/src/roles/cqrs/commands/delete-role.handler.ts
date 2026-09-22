/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, APP_SUBJECTS, AUDIT_ACTIONS } from '@common/constants';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, audit } from '@nestjs-pipeline/audit';
import { CaslAuthorizer, requires } from '@nestjs-pipeline/casl';
import { type IPipelineContext, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  IWriteSideAggregateRepository,
} from '@nestjs-pipeline/ddd-core/application';
import {
  EntityNotFoundException,
  isTransientOperationError,
} from '@nestjs-pipeline/ddd-core/domain';
import { resilience } from '@nestjs-pipeline/resilience';
import type { Role } from '../../domain/models/role.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { DeleteRoleCommand } from './delete-role.command';

@CommandHandler(DeleteRoleCommand)
@UsePipeline(
  requires({ action: APP_ACTIONS.DELETE, subject: APP_SUBJECTS.ROLE }),
  audit({
    action: AUDIT_ACTIONS.ROLE_DELETE,
    severity: AUDIT_SEVERITY.HIGH,
    metadata: (ctx: IPipelineContext) => {
      const cmd = ctx.request as DeleteRoleCommand | undefined;
      return cmd?.id ? { targetRoleId: cmd.id } : {};
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
export class DeleteRoleHandler extends CommandBaseHandler<
  DeleteRoleCommand,
  Role
> {
  constructor(
    @Inject(COMMAND_REPOSITORY.deleteRole)
    private readonly commandRepository: IWriteSideAggregateRepository<Role>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: DeleteRoleCommand): Promise<Role> {
    const role = await this.commandRepository.findById(command.id);
    if (!role) {
      throw new EntityNotFoundException('Role', command.id);
    }
    this.authorizer.authorize('delete', role);
    role.delete();
    await this.commandRepository.save(role);
    return role;
  }
}
