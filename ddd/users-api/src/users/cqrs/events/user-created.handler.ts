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

import { Inject, Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { getCorrelationId } from '@nestjs-pipeline/correlation';
import { DeadLetterBehavior } from '@nestjs-pipeline/deadletter';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import {
  type IWelcomeEmailDispatcher,
  WELCOME_EMAIL_DISPATCHER,
} from '../../application/ports/user-event-dispatcher.port';
import { UserCreatedEvent } from '../../domain/events/user-created.event';

@EventsHandler(UserCreatedEvent)
/**
 * Fire-and-forget side effect: if scheduling the welcome email fails, the
 * failure is dead-lettered but NOT re-thrown, so a transient delivery outage
 * never surfaces as an unhandled rejection from the event bus.
 */
@UsePipeline([DeadLetterBehavior, { rethrow: false }])
export class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  private readonly logger = new Logger(UserCreatedHandler.name);

  constructor(
    @Inject(WELCOME_EMAIL_DISPATCHER)
    private readonly welcomeEmailDispatcher: IWelcomeEmailDispatcher,
    private readonly tenantSchemaContext: TenantSchemaContext,
  ) {}

  async handle(event: UserCreatedEvent): Promise<void> {
    const { id: userId, username, email } = event.payload;
    const correlationId = getCorrelationId();
    const tenant = this.tenantSchemaContext.schema;

    this.logger.log(
      `📬 [${correlationId}] UserCreated — id: ${userId}, username: ${username}, email: ${email}, tenant: ${tenant}`,
    );

    await this.welcomeEmailDispatcher.enqueueWelcomeEmail({
      userId,
      username,
      email,
      tenant,
      correlationId,
    });

    this.logger.log(
      `📤 [${correlationId}] Enqueued welcome email job for ${email}`,
    );
  }
}
