/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { getCorrelationId } from '@nestjs-pipeline/correlation';
import { RoleUpdatedEvent } from '../../domain/events/role-updated.event';

@EventsHandler(RoleUpdatedEvent)
export class RoleUpdatedHandler implements IEventHandler<RoleUpdatedEvent> {
  private readonly logger = new Logger(RoleUpdatedHandler.name);

  async handle(event: RoleUpdatedEvent): Promise<void> {
    const { id: roleId, name } = event.payload;
    const correlationId = getCorrelationId();

    this.logger.log(
      `📬 [${correlationId}] RoleUpdated — id: ${roleId}, name: ${name}`,
    );
  }
}
