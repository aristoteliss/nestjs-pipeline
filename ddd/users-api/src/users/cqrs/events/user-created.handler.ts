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

import { Inject } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { DeadLetterBehavior } from '@nestjs-pipeline/deadletter';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import {
  type IWelcomeEmailDispatcher,
  WELCOME_EMAIL_DISPATCHER,
} from '../../application/ports/user-event-dispatcher.port';
import { UserCreatedEvent } from '../../domain/events/user-created.event';

@EventsHandler(UserCreatedEvent)
/**
 * Schedules the welcome-email side effect through the application port.
 * Cross-cutting request/event logging is supplied by {@link LoggingBehavior};
 * delivery failures are dead-lettered without being re-thrown.
 */
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [DeadLetterBehavior, { rethrow: false }],
)
export class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  constructor(
    @Inject(WELCOME_EMAIL_DISPATCHER)
    private readonly welcomeEmailDispatcher: IWelcomeEmailDispatcher,
    private readonly tenantSchemaContext: TenantSchemaContext,
  ) {}

  async handle(event: UserCreatedEvent): Promise<void> {
    const { id: userId, username, email } = event.payload;
    const tenant = this.tenantSchemaContext.schema;

    await this.welcomeEmailDispatcher.enqueueWelcomeEmail({
      userId,
      username,
      email,
      tenant,
    });
  }
}
