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
 * Minimal structural shape of an `amqplib` `Channel`. Declared locally so this
 * package does not hard-depend on `amqplib` — a real `Channel` (or
 * `ConfirmChannel`) satisfies it. Add it in your app: `pnpm add amqplib`.
 */
export interface RabbitMqChannelLike {
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: unknown,
  ): boolean;
  /** EventEmitter flow-control hook exposed by real amqplib channels. */
  once?(event: 'drain', listener: () => void): unknown;
}

/** Options for {@link RabbitMqDeadLetterTransport}. */
export interface RabbitMqDeadLetterTransportOptions {
  /**
   * Exchange to publish to. Default `''` (the AMQP default exchange), in which
   * case `routingKey` is treated as the destination queue name.
   */
  exchange?: string;
  /** Routing key (or queue name with the default exchange). Default `'dead-letter'`. */
  routingKey?: string;
  /**
   * Extra `amqplib` publish options, merged over the defaults
   * `{ persistent: true, contentType: 'application/json', correlationId }`.
   */
  publishOptions?: Record<string, unknown>;
}

/**
 * {@link DeadLetterTransport} backed by **RabbitMQ** (`amqplib`) — a drop-in
 * replacement for the BullMQ transport.
 *
 * Publishes each dead letter as a persistent JSON message. Make sure the target
 * exchange/queue exists (`channel.assertQueue(...)`) before use.
 *
 * @example
 * ```ts
 * const conn = await amqp.connect(process.env.AMQP_URL);
 * const channel = await conn.createChannel();
 * await channel.assertQueue('dead-letters', { durable: true });
 * const transport = new RabbitMqDeadLetterTransport(channel, { routingKey: 'dead-letters' });
 * ```
 */
export class RabbitMqDeadLetterTransport implements DeadLetterTransport {
  private readonly exchange: string;
  private readonly routingKey: string;
  private readonly publishOptions: Record<string, unknown>;

  constructor(
    private readonly channel: RabbitMqChannelLike,
    options: RabbitMqDeadLetterTransportOptions = {},
  ) {
    this.exchange = options.exchange ?? '';
    this.routingKey = options.routingKey ?? 'dead-letter';
    this.publishOptions = options.publishOptions ?? {};
  }

  async send(record: DeadLetterRecord): Promise<void> {
    const content = Buffer.from(JSON.stringify(record));
    const options = {
      persistent: true,
      contentType: 'application/json',
      correlationId: record.correlationId,
      ...this.publishOptions,
    };

    const writable = this.channel.publish(
      this.exchange,
      this.routingKey,
      content,
      options,
    );

    // amqplib models publish() after stream.Writable: false means the message
    // was buffered successfully but callers should stop writing until `drain`.
    // It is not a publish failure and must not be surfaced as one.
    if (!writable && this.channel.once) {
      await new Promise<void>((resolve) => {
        this.channel.once?.('drain', resolve);
      });
    }
  }
}
