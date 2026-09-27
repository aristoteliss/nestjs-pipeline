/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { UserUpdatedEvent } from '../../../domain/events/user-updated.event';
import {
  type IUserBatchDispatcher,
  USER_BATCH_DISPATCHER,
} from '../../ports/user-event-dispatcher.port';

@EventsHandler(UserUpdatedEvent)
export class UserUpdatedHandler implements IEventHandler<UserUpdatedEvent> {
  constructor(
    @Inject(USER_BATCH_DISPATCHER)
    private readonly userBatchDispatcher: IUserBatchDispatcher,
  ) {}

  async handle(event: UserUpdatedEvent): Promise<void> {
    const { id: userId, username } = event.payload;

    await this.userBatchDispatcher.enqueueUserBatch([{ userId, username }]);
  }
}
