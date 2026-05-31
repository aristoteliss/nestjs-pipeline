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
import { getCorrelationId } from '@nestjs-pipeline/correlation';
import type { JobsOptions, Queue } from 'bullmq';
import { UserUpdatedEvent } from '../../domain/events/user-updated.event';
import {
  BATCH_UPDATE_USERS_QUEUE,
  type BatchUpdateUserItem,
} from '../../jobs/batch-update-users.processor';

@EventsHandler(UserUpdatedEvent)
export class UserUpdatedHandler implements IEventHandler<UserUpdatedEvent> {
  private readonly logger = new Logger(UserUpdatedHandler.name);

  constructor(
    @InjectQueue(BATCH_UPDATE_USERS_QUEUE)
    private readonly batchUpdateQueue: Queue<BatchUpdateUserItem[]>,
  ) { }

  async handle(event: UserUpdatedEvent): Promise<void> {
    const {
      entity: { id: userId, username },
    } = event;
    const correlationId = getCorrelationId();

    this.logger.log(
      `📬 [${correlationId}] UserUpdated — id: ${userId}, username: ${username}`,
    );

    const items: BatchUpdateUserItem[] = [{ userId, username }];

    await this.batchUpdateQueue.add('batch-update', items, {
      ...{ correlationId },
    } as JobsOptions & { correlationId: string });

    this.logger.log(
      `📤 [${correlationId}] Enqueued batch-update job for user ${userId}`,
    );
  }
}
