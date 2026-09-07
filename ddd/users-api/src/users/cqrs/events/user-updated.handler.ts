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
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import {
  type IUserBatchDispatcher,
  USER_BATCH_DISPATCHER,
} from '../../application/ports/user-event-dispatcher.port';
import { UserUpdatedEvent } from '../../domain/events/user-updated.event';

@EventsHandler(UserUpdatedEvent)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class UserUpdatedHandler implements IEventHandler<UserUpdatedEvent> {
  constructor(
    @Inject(USER_BATCH_DISPATCHER)
    private readonly batchDispatcher: IUserBatchDispatcher,
    private readonly tenantSchemaContext: TenantSchemaContext,
  ) {}

  /**
   * Dispatches batch-update intent while logging/correlation remain pipeline and
   * infrastructure concerns rather than application-handler responsibilities.
   */
  async handle(event: UserUpdatedEvent): Promise<void> {
    const { id: userId, username } = event.payload;
    const tenant = this.tenantSchemaContext.schema;

    await this.batchDispatcher.enqueueUserBatch([
      { userId, username, tenant },
    ]);
  }
}
