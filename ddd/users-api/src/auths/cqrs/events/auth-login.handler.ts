/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { getCorrelationId } from '@nestjs-pipeline/correlation';
import { CreatedAuthEvent } from '../../domain/events/create-auth.event';

@EventsHandler(CreatedAuthEvent)
export class CreatedAuthHandler implements IEventHandler<CreatedAuthEvent> {
  private readonly logger = new Logger(CreatedAuthHandler.name);

  async handle(event: CreatedAuthEvent): Promise<void> {
    const { payload } = event;
    const correlationId = getCorrelationId();

    this.logger.log(
      `AuthLogin [${correlationId}] authId: ${payload.id}, userId: ${payload.userId}`,
    );
  }
}
