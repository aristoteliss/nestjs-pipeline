/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { deadLetter } from '@nestjs-pipeline/deadletter';
import { UserCreatedEvent } from '../../../domain/events/user-created.event';
import {
  type IWelcomeEmailDispatcher,
  WELCOME_EMAIL_DISPATCHER,
} from '../../ports/user-event-dispatcher.port';

@EventsHandler(UserCreatedEvent)
@UsePipeline(deadLetter({ rethrow: false }))
export class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  constructor(
    @Inject(WELCOME_EMAIL_DISPATCHER)
    private readonly welcomeEmailDispatcher: IWelcomeEmailDispatcher,
  ) {}

  async handle(event: UserCreatedEvent): Promise<void> {
    const { id: userId, username, email } = event.payload;

    await this.welcomeEmailDispatcher.enqueueWelcomeEmail({
      userId,
      username,
      email,
    });
  }
}
