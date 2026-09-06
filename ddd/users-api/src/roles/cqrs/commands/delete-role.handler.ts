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

import { APP_ACTIONS, APP_SUBJECTS, AUDIT_ACTIONS } from '@common/constants';
import { getSessionUserFromStore } from '@common/context/session-user.store';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, AuditBehavior } from '@nestjs-pipeline/audit';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
  IQueryRepository,
} from '@nestjs-pipeline/ddd-core';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';
import { isTransientPersistenceError } from '@persistence/is-transient-persistence-error';
import { Role } from '../../domain/models/role.entity';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from '../../persistence/repository.tokens';
import { GetRoleQuery } from '../queries/get-role.query';
import { DeleteRoleCommand } from './delete-role.command';

@CommandHandler(DeleteRoleCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [
    CaslBehavior,
    {
      rules: [{ action: APP_ACTIONS.DELETE, subject: APP_SUBJECTS.ROLE }],
    },
  ],
  // Resilience policy for transient faults during role deletion
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
  // Audit the sensitive role deletion action
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
    @Inject(QUERY_REPOSITORY.getRole)
    private readonly queryRepository: IQueryRepository<
      GetRoleQuery,
      Role | null
    >,
    @Inject(COMMAND_REPOSITORY.deleteRole)
    private readonly commandRepository: ICommandRepository<Role, null>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: DeleteRoleCommand): Promise<Role> {
    const { id } = command;

    const query = new GetRoleQuery({ roleId: id }, { hydrate: true });
    const role = Role.from(await this.queryRepository.find(query));

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    this.authorizer.authorize('delete', role);

    role.delete();

    await this.commandRepository.save(role);

    return role;
  }
}
