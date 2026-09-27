/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { currentScope, runInScope } from '@nestjs-pipeline/core';
import { DEFAULT_CORRELATION_HEADER } from './constants/correlation.constants';
import { uuidv7 } from './helpers/uuidv7';

/**
 * Run a callback within a correlation context.
 *
 * Use this in **non-HTTP entry points** (Bull processors, RabbitMQ handlers,
 * WebSocket gateways, cron jobs, etc.) to propagate an external correlation ID
 * into any CQRS commands or queries dispatched inside the callback.
 *
 * If `correlationId` is falsy (`undefined` or empty), the id is resolved via
 * {@link getCorrelationId} (the current one, or a generated `uuidv7()`), so
 * `fn` always runs with a correlation id. A pipeline dispatched inside `fn`
 * takes it as its `context.correlationId`.
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
  return runInScope({ correlationId: correlationId || getCorrelationId() }, fn);
}

/**
 * Read the current correlation ID.
 *
 * It is the correlation id of the current execution scope of
 * `@nestjs-pipeline/core`, set by {@link runWithCorrelationId}, the HTTP
 * middleware, or a running pipeline. Outside any, a new UUIDv7 is generated on
 * each call, so it always returns a string.
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
  return currentScope().correlationId || uuidv7();
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
 * @throws {TypeError} If `data` is not a plain object.
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
  const prototype =
    data !== null && typeof data === 'object'
      ? Object.getPrototypeOf(data)
      : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(
      'addCorrelationId(data) requires a plain object payload. ' +
        'Wrap arrays and class instances in a plain object first.',
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
  key = DEFAULT_CORRELATION_HEADER,
): Record<string, string> {
  return { [key]: getCorrelationId() };
}
