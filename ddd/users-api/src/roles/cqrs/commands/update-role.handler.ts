/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { Inject, NotFoundException, Scope } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { CommandBaseHandler, IWriteSideAggregateRepository } from '@nestjs-pipeline/ddd-core';
import { UniqueRoleNameException } from '../../domain/models/errors/role-name.exception';
import { Role, type RoleSnapshot } from '../../domain/models/role.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { UpdateRoleCommand } from './update-role.command';

@CommandHandler(UpdateRoleCommand, { scope: Scope.REQUEST })
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log', mapLogLevel: new Map([[UniqueRoleNameException, 'warn']]) }],
  [CaslBehavior, { rules: [{ action: APP_ACTIONS.UPDATE, subject: APP_SUBJECTS.ROLE }] }],
)
export class UpdateRoleHandler extends CommandBaseHandler<UpdateRoleCommand, Role> {
  constructor(
    @Inject(COMMAND_REPOSITORY.updateRole)
    private readonly commandRepository: IWriteSideAggregateRepository<Role, RoleSnapshot, RoleSnapshot>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) { super(eventBus); }

  /** Loads the authoritative write-side snapshot before applying a rename. */
  async handle(command: UpdateRoleCommand): Promise<Role> {
    const snapshot = await this.commandRepository.findById(command.id);
    const role = snapshot ? Role.fromJSON(snapshot) : null;
    if (!role) throw new NotFoundException('Role not found');
    this.authorizer.authorize('update', role, ['name']);
    role.rename(command.name);
    await this.commandRepository.save(role);
    return role;
  }
}
