/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type ITenantContext,
  TENANT_CONTEXT,
} from '@common/context/tenant-context.port';
import { Inject } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { DeadLetterBehavior } from '@nestjs-pipeline/deadletter';
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
    @Inject(TENANT_CONTEXT)
    private readonly tenantContext: ITenantContext,
  ) {}

  async handle(event: UserCreatedEvent): Promise<void> {
    const { id: userId, username, email } = event.payload;
    const tenant = this.tenantContext.schema;

    await this.welcomeEmailDispatcher.enqueueWelcomeEmail({
      userId,
      username,
      email,
      tenant,
    });
  }
}
