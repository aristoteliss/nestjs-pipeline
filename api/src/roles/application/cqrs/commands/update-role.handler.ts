/* Copyright (C) 2026-present Aristotelis — see repository license. */
import {
  APP_ACTIONS,
  APP_SUBJECTS,
  AUDIT_ACTIONS,
} from '@common/constants/index.js';
import { IWriteSideAggregateRepository } from '@cqrs-ddd/core/application';
import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import {
  type IPipelineContext,
  logging,
  UsePipeline,
} from '@cqrs-ddd/pipeline';
import { AUDIT_SEVERITY, audit } from '@cqrs-ddd/pipeline-audit';
import { CaslAuthorizer, requires } from '@cqrs-ddd/pipeline-casl';
import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { UniqueRoleNameException } from '../../../domain/models/errors/role-name.exception.js';
import type { Role } from '../../../domain/models/role.entity.js';
import { COMMAND_REPOSITORY } from '../../../persistence/repository.tokens.js';
import { UpdateRoleCommand } from './update-role.command.js';

@CommandHandler(UpdateRoleCommand)
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
export class UpdateRoleHandler
  implements ICommandHandler<UpdateRoleCommand, Role>
{
  constructor(
    @Inject(COMMAND_REPOSITORY.updateRole)
    private readonly commandRepository: IWriteSideAggregateRepository<Role>,
    private readonly authorizer: CaslAuthorizer,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: UpdateRoleCommand): Promise<Role> {
    const role = await this.commandRepository.findById(command.id);
    if (!role) {
      throw new EntityNotFoundException('Role', command.id);
    }
    this.authorizer.authorize(
      'update',
      role,
      command.getUpdateFields(UpdateRoleCommand.updatableFields),
    );
    role.rename(command.name);
    await this.commandRepository.save(role);
    await this.publisher.mergeObjectContext(role).commit();
    return role;
  }
}
