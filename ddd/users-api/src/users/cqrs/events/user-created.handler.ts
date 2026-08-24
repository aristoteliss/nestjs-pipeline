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

import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import {
  addCorrelationId,
  getCorrelationId,
} from '@nestjs-pipeline/correlation';
import { DeadLetterBehavior } from '@nestjs-pipeline/deadletter';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import type { Queue } from 'bullmq';
import { UserCreatedEvent } from '../../domain/events/user-created.event';
import {
  WELCOME_EMAIL_QUEUE,
  type WelcomeEmailJobData,
} from '../../jobs/send-welcome-email.processor';

@EventsHandler(UserCreatedEvent)
/**
 * Fire-and-forget side effect: if enqueuing the welcome email fails, the
 * failure is dead-lettered (captured to the 'dead-letters' queue for replay)
 * but NOT re-thrown, so a transient email/queue outage never surfaces as an
 * unhandled rejection from the event bus. `{ rethrow: false }` overrides the
 * global DeadLetterBehavior's default re-throw for this handler only.
 */
@UsePipeline([DeadLetterBehavior, { rethrow: false }])
export class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  private readonly logger = new Logger(UserCreatedHandler.name);

  constructor(
    @InjectQueue(WELCOME_EMAIL_QUEUE)
    private readonly welcomeEmailQueue: Queue<WelcomeEmailJobData>,
  ) { }

  async handle(event: UserCreatedEvent): Promise<void> {
    const {
      entity: { id: userId, username, email },
    } = event;
    const correlationId = getCorrelationId();
    const tenant = TenantSchemaContext.currentSchema;

    this.logger.log(
      `📬 [${correlationId}] UserCreated — id: ${userId}, username: ${username}, email: ${email}, tenant: ${tenant}`,
    );

    // addCorrelationId stamps the current correlationId into the job data — works with any queue
    await this.welcomeEmailQueue.add(
      'send',
      addCorrelationId({ userId, username, email, tenant }),
    );

    this.logger.log(
      `📤 [${correlationId}] Enqueued welcome email job for ${email}`,
    );
  }
}
