/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, APP_SUBJECTS, AUDIT_ACTIONS } from '@common/constants';
import { getSessionUserFromStore } from '@common/context/session-user.store';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, AuditBehavior } from '@nestjs-pipeline/audit';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import {
  type IPipelineContext,
  LoggingBehavior,
  UsePipeline,
} from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  EntityNotFoundException,
  IWriteSideAggregateRepository,
  isTransientOperationError,
} from '@nestjs-pipeline/ddd-core';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';
import type { Role } from '../../domain/models/role.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { DeleteRoleCommand } from './delete-role.command';

@CommandHandler(DeleteRoleCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [
    CaslBehavior,
    { rules: [{ action: APP_ACTIONS.DELETE, subject: APP_SUBJECTS.ROLE }] },
  ],
  // AuditBehavior sits outside ResilienceBehavior on purpose: it writes one
  // record per invocation, so inside the retry a delete that failed twice
  // before succeeding produced three records for one logical operation, with
  // a duration measuring a single attempt.
  [
    AuditBehavior,
    {
      action: AUDIT_ACTIONS.ROLE_DELETE,
      severity: AUDIT_SEVERITY.HIGH,
      metadataFactory: (ctx: IPipelineContext) => {
        const cmd = ctx.request as DeleteRoleCommand;
        const actor = getSessionUserFromStore();
        return cmd && actor
          ? {
              targetRoleId: cmd.id,
              deletedByUserId: actor.id,
              deletedByEmail: actor.email,
            }
          : undefined;
      },
    },
  ],
  [
    ResilienceBehavior,
    {
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
    },
  ],
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

  /**
   * Loads authoritative write-side state and keeps not-found semantics transport-neutral.
   * Retryability is supplied by the repository through `TransientOperationError`;
   * this handler does not inspect persistence-specific driver codes.
   */
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
