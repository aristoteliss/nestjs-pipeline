/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { addCorrelationId, getCorrelationId } from '@nestjs-pipeline/correlation';
import type { JobsOptions, Queue } from 'bullmq';
import type {
  IUserBatchDispatcher,
  IWelcomeEmailDispatcher,
  UserBatchDispatchItem,
  WelcomeEmailDispatch,
} from '../application/ports/user-event-dispatcher.port';
import {
  BATCH_UPDATE_USERS_QUEUE,
  type BatchUpdateUserItem,
} from './batch-update-users.processor';
import {
  WELCOME_EMAIL_QUEUE,
  type WelcomeEmailJobData,
} from './send-welcome-email.processor';

/**
 * BullMQ infrastructure adapter for user-event application dispatch ports.
 * Queue correlation metadata is derived from the current correlation store here,
 * not carried as an application-handler concern.
 */
@Injectable()
export class BullMqUserEventDispatcher
  implements IWelcomeEmailDispatcher, IUserBatchDispatcher
{
  constructor(
    @InjectQueue(WELCOME_EMAIL_QUEUE)
    private readonly welcomeEmailQueue: Queue<WelcomeEmailJobData>,
    @InjectQueue(BATCH_UPDATE_USERS_QUEUE)
    private readonly batchUpdateQueue: Queue<BatchUpdateUserItem[]>,
  ) {}

  async enqueueWelcomeEmail(message: WelcomeEmailDispatch): Promise<void> {
    await this.welcomeEmailQueue.add('send', addCorrelationId(message));
  }

  async enqueueUserBatch(
    items: readonly UserBatchDispatchItem[],
  ): Promise<void> {
    await this.batchUpdateQueue.add(
      'batch-update',
      items.map((item) => ({ ...item })),
      { correlationId: getCorrelationId() } as JobsOptions & {
        correlationId: string;
      },
    );
  }
}
