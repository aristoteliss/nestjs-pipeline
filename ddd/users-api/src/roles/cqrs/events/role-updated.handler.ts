import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { getCorrelationId } from '@nestjs-pipeline/correlation';
import { RoleUpdatedEvent } from '../../domain/events/role-updated.event';

@EventsHandler(RoleUpdatedEvent)
export class RoleUpdatedHandler implements IEventHandler<RoleUpdatedEvent> {
  private readonly logger = new Logger(RoleUpdatedHandler.name);

  async handle(event: RoleUpdatedEvent): Promise<void> {
    const {
      entity: { id: roleId, name },
    } = event;
    const correlationId = getCorrelationId();

    this.logger.log(
      `📬 [${correlationId}] RoleUpdated — id: ${roleId}, name: ${name}`,
    );
  }
}
