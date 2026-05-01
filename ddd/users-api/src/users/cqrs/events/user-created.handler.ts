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
import {
  addCorrelationId,
  getCorrelationId,
} from '@nestjs-pipeline/correlation';
import type { Queue } from 'bullmq';
import { UserCreatedEvent } from '../../domain/events/user-created.event';
import {
  WELCOME_EMAIL_QUEUE,
  type WelcomeEmailJobData,
} from '../../jobs/send-welcome-email.processor';

@EventsHandler(UserCreatedEvent)
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

    this.logger.log(
      `📬 [${correlationId}] UserCreated — id: ${userId}, username: ${username}, email: ${email}`,
    );

    // addCorrelationId stamps the current correlationId into the job data — works with any queue
    await this.welcomeEmailQueue.add(
      'send',
      addCorrelationId({ userId, username, email }),
    );

    this.logger.log(
      `📤 [${correlationId}] Enqueued welcome email job for ${email}`,
    );
  }
}
