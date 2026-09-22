/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type ITenantContext,
  TENANT_CONTEXT,
} from '@common/context/tenant-context.port';
import { Inject } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { logging, UsePipeline } from '@nestjs-pipeline/core';
import {
  type IUserBatchDispatcher,
  USER_BATCH_DISPATCHER,
} from '../../application/ports/user-event-dispatcher.port';
import { UserUpdatedEvent } from '../../domain/events/user-updated.event';

@EventsHandler(UserUpdatedEvent)
@UsePipeline(logging({ requestResponseLogLevel: 'log' }))
export class UserUpdatedHandler implements IEventHandler<UserUpdatedEvent> {
  constructor(
    @Inject(USER_BATCH_DISPATCHER)
    private readonly userBatchDispatcher: IUserBatchDispatcher,
    @Inject(TENANT_CONTEXT)
    private readonly tenantContext: ITenantContext,
  ) {}

  async handle(event: UserUpdatedEvent): Promise<void> {
    const { id: userId, username } = event.payload;
    const tenant = this.tenantContext.schema;

    await this.userBatchDispatcher.enqueueUserBatch([
      { userId, username, tenant },
    ]);
  }
}
