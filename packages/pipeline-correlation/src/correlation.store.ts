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

import { AsyncLocalStorage } from 'node:async_hooks';
import { uuidv7 } from './helpers/uuidv7';

/**
 * Async-local store that holds the current correlation ID.
 *
 * **How it gets populated:**
 * - **HTTP** — {@link HttpCorrelationMiddleware} reads the configured header
 *   (default `x-correlation-id`) and calls `correlationStore.run()`.
 * - **Non-HTTP** (Bull, RabbitMQ, WebSocket, cron, etc.) — use
 *   {@link runWithCorrelationId} in your processor / handler.
 * - **Pipeline integration** — configure the core module's
 *   `correlationIdRunner` with {@link runWithCorrelationId} when pipeline runs
 *   should also populate this store.
 *
 * **How it is consumed:**
 * Call {@link getCorrelationId} to read the current store. If no store value is
 * active, an optional registered fallback is consulted and then a `uuidv7()` is
 * generated (timestamp-sortable UUID per RFC 9562).
 *
 * Uses Node.js built-in `AsyncLocalStorage` — zero external dependencies.
 *
 * @example
 * ```ts
 * // Read the raw store value without generating a fallback ID
 * const id = correlationStore.getStore(); // string | undefined
 * ```
 */
export const correlationStore = new AsyncLocalStorage<string>();

/**
 * Optional fallback function used by {@link getCorrelationId} when no
 * correlation store is active.
 *
 * @internal
 */
let _correlationFallback: (() => string | undefined) | undefined;

/**
 * Register a fallback function for {@link getCorrelationId}.
 *
 * The fallback is consulted only when `correlationStore.getStore()` returns no
 * value. Consumers that need another ambient correlation source can register it
 * here.
 *
 * @param fn - Fallback that returns a correlation ID or `undefined`.
 *
 * @internal
 */
export function setCorrelationFallback(fn: () => string | undefined): void {
  _correlationFallback = fn;
}

/**
 * Run a callback within a correlation context.
 *
 * Use this in **non-HTTP entry points** (Bull processors, RabbitMQ handlers,
 * WebSocket gateways, cron jobs, etc.) to propagate an external correlation ID
 * into any CQRS commands or queries dispatched inside the callback.
 *
 * If `correlationId` is falsy (`undefined` or empty), the id is resolved via
 * {@link getCorrelationId} (active fallback source, or a generated `uuidv7()`),
 * and `fn` always executes inside a populated correlation store.
 *
 * @example
 * ```ts
 * // Bull processor
 * @Processor('my-queue')
 * export class MyProcessor {
 *   @Process()
 *   async handle(job: Job) {
 *     return runWithCorrelationId(job.data.correlationId, () =>
 *       this.commandBus.execute(new MyCommand(job.data)),
 *     );
 *   }
 * }
 *
 * // RabbitMQ microservice handler
 * @MessagePattern('user.created')
 * async handle(@Payload() data: any, @Ctx() ctx: RmqContext) {
 *   const id = ctx.getMessage().properties.correlationId;
 *   return runWithCorrelationId(id, () =>
 *     this.commandBus.execute(new MyCommand(data)),
 *   );
 * }
 *
 * // Cron job
 * @Cron('0 * * * *')
 * async hourlySync() {
 *   return runWithCorrelationId(randomUUID(), () =>
 *     this.commandBus.execute(new SyncCommand()),
 *   );
 * }
 * ```
 *
 * @param correlationId - The correlation ID to propagate. If falsy, falls back to {@link getCorrelationId}.
 * @param fn - The callback to execute within the correlation context.
 */
export function runWithCorrelationId<T>(
  correlationId: string | undefined,
  fn: () => T,
): T {
  const id = correlationId || getCorrelationId();
  return correlationStore.run(id, fn);
}

/**
 * Read the current correlation ID.
 *
 * Resolution order:
 * 1. the active {@link correlationStore};
 * 2. the fallback registered with {@link setCorrelationFallback};
 * 3. a newly generated UUIDv7.
 *
 * Therefore this function always returns a string, even when called outside an
 * existing correlation context. Pipeline handlers participate in this store
 * when the core module is configured with `correlationIdRunner:
 * runWithCorrelationId`.
 *
 * @publicApi
 *
 * @example
 * ```ts
 * import { getCorrelationId } from '@nestjs-pipeline/correlation';
 *
 * @Process('send-email')
 * @WithCorrelation()
 * async handle(job: Job) {
 *   const id = getCorrelationId();
 *   this.logger.log(`Processing with correlation: ${id}`);
 *   await this.commandBus.execute(new SendEmailCommand(job.data));
 * }
 * ```
 */
export function getCorrelationId(): string {
  return correlationStore.getStore() || _correlationFallback?.() || uuidv7();
}

/**
 * Utility type that adds a `correlationId` field to any data shape.
 *
 * Use it to type BullMQ job data, RabbitMQ payloads, Kafka messages, etc.
 * so that the correlation ID is part of the contract.
 *
 * @example
 * ```ts
 * interface WelcomeEmailJobData {
 *   userId: string;
 *   email: string;
 * }
 *
 * // Queue typed as Queue<WithCorrelationId<WelcomeEmailJobData>>
 * await queue.add('send', addCorrelationId({ userId, email }));
 * ```
 *
 * @publicApi
 */
export type WithCorrelationId<T = Record<string, unknown>> = T & {
  correlationId: string;
};

/**
 * Stamp the current correlation ID onto a data object.
 *
 * This is the **producer-side** counterpart to {@link WithCorrelation}:
 * - `addCorrelationId(data)` → stamps the ID when **enqueuing** a job / publishing a message
 * - `@WithCorrelation()` → extracts the ID when **processing** the job / handling the message
 *
 * Both default to the `'correlationId'` key, so they work together out of the box.
 *
 * @throws {TypeError} If `data` is an array. Spreading an array into an object
 * destroys its structure (indices become string keys, `length` is lost) and
 * breaks the serialization contract on the consumer side. Wrap the array
 * first: `addCorrelationId({ items: myArray })`.
 *
 * @example
 * ```ts
 * // Bull / BullMQ
 * await queue.add('send-email', addCorrelationId({ userId, email }));
 *
 * // RabbitMQ (ClientProxy)
 * this.client.emit('user.created', addCorrelationId(payload));
 *
 * // Kafka
 * await this.producer.send({
 *   topic: 'orders',
 *   messages: [{ value: JSON.stringify(addCorrelationId(order)) }],
 * });
 *
 * // PostgreSQL NOTIFY
 * await sql`SELECT pg_notify('events', ${JSON.stringify(addCorrelationId(data))})`;
 *
 * // ⚠️ Arrays must be wrapped — passing one directly throws:
 * // addCorrelationId([item1, item2]);           // ❌ TypeError
 * addCorrelationId({ items: [item1, item2] });   // ✅
 * ```
 *
 * @param data - The payload to enrich. Must be a plain object, **not** an array.
 *              A shallow copy is returned; the original is not mutated.
 * @returns A new object with `correlationId` added.
 *
 * @publicApi
 */
export function addCorrelationId<T extends Record<string, unknown>>(
  data: T,
): WithCorrelationId<T> {
  if (Array.isArray(data)) {
    throw new TypeError(
      'addCorrelationId(data) received an array. Spreading an array into an object ' +
        'destroys its structure and breaks the serialization contract. ' +
        'Wrap it first: addCorrelationId({ items: myArray })',
    );
  }
  return { ...data, correlationId: getCorrelationId() };
}

/**
 * Return a headers object stamped with the current correlation ID.
 *
 * Use this for **header-based** transports (Kafka, NATS, gRPC metadata, HTTP)
 * where the correlation ID belongs in message headers / metadata — **not** in
 * the data payload.
 *
 * For transports without native headers (Bull/BullMQ, PostgreSQL NOTIFY), use
 * {@link addCorrelationId} instead.
 *
 * @param key - Header name. Defaults to `'x-correlation-id'`.
 * @returns `{ [key]: correlationId }` — spread into your transport's headers.
 *
 * @publicApi
 *
 * @example
 * ```ts
 * // Kafka
 * await producer.send({
 *   topic: 'orders',
 *   messages: [{ value: JSON.stringify(order), headers: correlationHeaders() }],
 * });
 *
 * // RabbitMQ (amqplib) — AMQP has a first-class correlationId property:
 * channel.publish(exchange, key, buffer, { correlationId: getCorrelationId() });
 * // …or in headers:
 * channel.publish(exchange, key, buffer, { headers: correlationHeaders() });
 *
 * // NATS
 * const headers = nats.headers();
 * Object.entries(correlationHeaders()).forEach(([k, v]) => headers.set(k, v));
 * nc.publish(subject, payload, { headers });
 *
 * // HTTP (outgoing)
 * await fetch(url, { headers: { ...correlationHeaders(), 'content-type': 'application/json' } });
 * ```
 */
export function correlationHeaders(
  key = 'x-correlation-id',
): Record<string, string> {
  return { [key]: getCorrelationId() };
}
