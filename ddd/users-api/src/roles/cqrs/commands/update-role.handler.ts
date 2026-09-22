/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, APP_SUBJECTS, AUDIT_ACTIONS } from '@common/constants';
import { Inject, Scope } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, audit } from '@nestjs-pipeline/audit';
import { CaslAuthorizer, requires } from '@nestjs-pipeline/casl';
import {
  type IPipelineContext,
  logging,
  UsePipeline,
} from '@nestjs-pipeline/core';
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
  logging({
    mapLogLevel: new Map([[UniqueRoleNameException, 'warn']]),
  }),
  requires({ action: APP_ACTIONS.UPDATE, subject: APP_SUBJECTS.ROLE }),
  audit({
    action: AUDIT_ACTIONS.ROLE_UPDATE,
    severity: AUDIT_SEVERITY.MEDIUM,
    metadata: (ctx: IPipelineContext) => {
      const cmd = ctx.request as UpdateRoleCommand | undefined;
      return cmd?.id ? { targetRoleId: cmd.id } : {};
    },
  }),
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
