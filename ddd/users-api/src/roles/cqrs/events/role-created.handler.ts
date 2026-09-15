/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { getCorrelationId } from '@nestjs-pipeline/correlation';
import { RoleCreatedEvent } from '../../domain/events/role-created.event';

@EventsHandler(RoleCreatedEvent)
export class RoleCreatedHandler implements IEventHandler<RoleCreatedEvent> {
  private readonly logger = new Logger(RoleCreatedHandler.name);

  async handle(event: RoleCreatedEvent): Promise<void> {
    const { id: roleId, name } = event.payload;
    const correlationId = getCorrelationId();

    this.logger.log(
      `📬 [${correlationId}] RoleCreated — id: ${roleId}, name: ${name}`,
    );
  }
}
