/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { withJobContext } from '@cqrs-ddd/pipeline-job-context';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type {
  IUserBatchDispatcher,
  IWelcomeEmailDispatcher,
  UserBatchDispatchItem,
  WelcomeEmailDispatch,
} from '../application/ports/user-event-dispatcher.port.js';
import {
  BATCH_UPDATE_USERS_QUEUE,
  type BatchUpdateUsersJobData,
} from './batch-update-users.processor.js';
import {
  WELCOME_EMAIL_QUEUE,
  type WelcomeEmailJobData,
} from './send-welcome-email.processor.js';

/**
 * BullMQ infrastructure adapter for user-event application dispatch ports.
 * Both queues stamp the caller's tenant, correlation id and principal into the
 * job payload with `withJobContext`; the processors restore them with
 * `@InJobContext`.
 */
@Injectable()
export class BullMqUserEventDispatcher
  implements IWelcomeEmailDispatcher, IUserBatchDispatcher
{
  constructor(
    @InjectQueue(WELCOME_EMAIL_QUEUE)
    private readonly welcomeEmailQueue: Queue<WelcomeEmailJobData>,
    @InjectQueue(BATCH_UPDATE_USERS_QUEUE)
    private readonly batchUpdateQueue: Queue<BatchUpdateUsersJobData>,
  ) {}

  async enqueueWelcomeEmail(message: WelcomeEmailDispatch): Promise<void> {
    await this.welcomeEmailQueue.add('send', withJobContext(message));
  }

  async enqueueUserBatch(
    items: readonly UserBatchDispatchItem[],
  ): Promise<void> {
    await this.batchUpdateQueue.add(
      'batch-update',
      withJobContext({ items: items.map((item) => ({ ...item })) }),
    );
  }
}
