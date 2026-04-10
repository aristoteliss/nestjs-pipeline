import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { getCorrelationId } from '@nestjs-pipeline/correlation';
import { RoleDeletedEvent } from '../../domain/events/role-deleted.event';

@EventsHandler(RoleDeletedEvent)
export class RoleDeletedHandler implements IEventHandler<RoleDeletedEvent> {
  private readonly logger = new Logger(RoleDeletedHandler.name);

  async handle(event: RoleDeletedEvent): Promise<void> {
    const {
      entity: { id: roleId, name },
    } = event;
    const correlationId = getCorrelationId();

    this.logger.log(
      `📬 [${correlationId}] RoleDeleted — id: ${roleId}, name: ${name}`,
    );
  }
}
