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

import type {
  DeadLetterRecord,
  DeadLetterTransport,
} from '../interfaces/dead-letter-transport.interface';

/**
 * Minimal structural shape of a BullMQ `Queue`. Declared locally so this package
 * does not hard-depend on `bullmq` — a real `Queue` satisfies it. Add the queue
 * as a peer in your app: `pnpm add bullmq`.
 */
export interface BullMqQueueLike {
  add(name: string, data: unknown, opts?: unknown): Promise<unknown>;
}

/** Options for {@link BullMqDeadLetterTransport}. */
export interface BullMqDeadLetterTransportOptions {
  /** Job name added to the queue for each dead letter. Default `'dead-letter'`. */
  jobName?: string;
  /**
   * BullMQ `JobsOptions` for the dead-letter job. Defaults keep failures
   * inspectable: `{ removeOnComplete: false, removeOnFail: false, attempts: 1 }`.
   */
  jobOptions?: unknown;
}

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: false,
  removeOnFail: false,
  attempts: 1,
};

/**
 * {@link DeadLetterTransport} backed by a **BullMQ** queue (the default).
 *
 * Each dead letter is added as a job; a worker (or Bull Board) can then inspect,
 * alert on, or replay it. The constructor takes any object matching
 * {@link BullMqQueueLike}, so a real `bullmq` `Queue` works directly.
 *
 * @example
 * ```ts
 * import { Queue } from 'bullmq';
 * const queue = new Queue('dead-letters', { connection: { host, port } });
 * const transport = new BullMqDeadLetterTransport(queue);
 * ```
 */
export class BullMqDeadLetterTransport implements DeadLetterTransport {
  private readonly jobName: string;
  private readonly jobOptions: unknown;

  constructor(
    private readonly queue: BullMqQueueLike,
    options: BullMqDeadLetterTransportOptions = {},
  ) {
    this.jobName = options.jobName ?? 'dead-letter';
    this.jobOptions = options.jobOptions ?? DEFAULT_JOB_OPTIONS;
  }

  async send(record: DeadLetterRecord): Promise<void> {
    await this.queue.add(this.jobName, record, this.jobOptions);
  }
}
