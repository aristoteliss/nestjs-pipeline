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
import { getCorrelationId } from '@nestjs-pipeline/correlation';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import {
  type IUserBatchDispatcher,
  USER_BATCH_DISPATCHER,
} from '../../application/ports/user-event-dispatcher.port';
import { UserUpdatedEvent } from '../../domain/events/user-updated.event';

@EventsHandler(UserUpdatedEvent)
export class UserUpdatedHandler implements IEventHandler<UserUpdatedEvent> {
  private readonly logger = new Logger(UserUpdatedHandler.name);

  constructor(
    @Inject(USER_BATCH_DISPATCHER)
    private readonly batchDispatcher: IUserBatchDispatcher,
    private readonly tenantSchemaContext: TenantSchemaContext,
  ) {}

  async handle(event: UserUpdatedEvent): Promise<void> {
    const { id: userId, username } = event.payload;
    const correlationId = getCorrelationId();
    const tenant = this.tenantSchemaContext.schema;

    this.logger.log(
      `📬 [${correlationId}] UserUpdated — id: ${userId}, username: ${username}, tenant: ${tenant}`,
    );

    await this.batchDispatcher.enqueueUserBatch(
      [{ userId, username, tenant }],
      correlationId,
    );

    this.logger.log(
      `📤 [${correlationId}] Enqueued batch-update job for user ${userId}`,
    );
  }
}
