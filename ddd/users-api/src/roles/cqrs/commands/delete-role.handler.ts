/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, APP_SUBJECTS, AUDIT_ACTIONS } from '@common/constants';
import { getSessionUserFromStore } from '@common/context/session-user.store';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, AuditBehavior } from '@nestjs-pipeline/audit';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  EntityNotFoundException,
  IWriteSideAggregateRepository,
} from '@nestjs-pipeline/ddd-core';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';
import { isTransientPersistenceError } from '@persistence/is-transient-persistence-error';
import { Role, type RoleSnapshot } from '../../domain/models/role.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { DeleteRoleCommand } from './delete-role.command';

@CommandHandler(DeleteRoleCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [
    CaslBehavior,
    { rules: [{ action: APP_ACTIONS.DELETE, subject: APP_SUBJECTS.ROLE }] },
  ],
  [
    ResilienceBehavior,
    {
      handle: isTransientPersistenceError,
      retry: {
        maxAttempts: 3,
        backoff: { type: 'exponential', initialDelay: 100, maxDelay: 2_000 },
      },
    },
  ],
  [
    AuditBehavior,
    {
      action: AUDIT_ACTIONS.ROLE_DELETE,
      severity: AUDIT_SEVERITY.HIGH,
      actor: () => {
        const sessionUser = getSessionUserFromStore();
        return sessionUser
          ? { id: sessionUser.id, email: sessionUser.email ?? undefined }
          : undefined;
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
    private readonly commandRepository: IWriteSideAggregateRepository<
      Role,
      RoleSnapshot,
      null
    >,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  /** Loads authoritative write-side state and keeps not-found semantics transport-neutral. */
  async handle(command: DeleteRoleCommand): Promise<Role> {
    const snapshot = await this.commandRepository.findById(command.id);
    const role = snapshot ? Role.fromJSON(snapshot) : null;
    if (!role) {
      throw new EntityNotFoundException('Role', command.id);
    }
    this.authorizer.authorize('delete', role);
    role.delete();
    await this.commandRepository.save(role);
    return role;
  }
}
