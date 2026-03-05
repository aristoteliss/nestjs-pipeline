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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { addCorrelationId, getCorrelationId } from '@nestjs-pipeline/core';
import { UserCreatedEvent } from './user-created.event';
import { WELCOME_EMAIL_QUEUE, WelcomeEmailJobData } from '../../jobs/send-welcome-email.processor';

@EventsHandler(UserCreatedEvent)
export class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  private readonly logger = new Logger(UserCreatedHandler.name);

  constructor(
    @InjectQueue(WELCOME_EMAIL_QUEUE)
    private readonly welcomeEmailQueue: Queue<WelcomeEmailJobData>,
  ) {}

  async handle(event: UserCreatedEvent): Promise<void> {
    const { userId, username, email } = event;
    const correlationId = getCorrelationId();

    this.logger.log(
      `📬 [${correlationId}] UserCreated — id: ${userId}, username: ${username}, email: ${email}`,
    );

    // addCorrelationId stamps the current correlationId into the job data — works with any queue
    await this.welcomeEmailQueue.add('send', addCorrelationId({ userId, username, email }));

    this.logger.log(`📤 [${correlationId}] Enqueued welcome email job for ${email}`);
  }
}
