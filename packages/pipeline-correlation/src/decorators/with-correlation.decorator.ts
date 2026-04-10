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

import { Logger, LoggerService, LogLevel } from '@nestjs/common';
import { getCorrelationId, runWithCorrelationId } from '../correlation.store';
import { dyn, untyped } from '../types/safe-typing';

/**
 * A function that extracts the correlation ID from the method arguments.
 *
 * Receives the same arguments the decorated method receives.
 * Return `undefined` to let the pipeline fall back to parent context or `uuidv7()`.
 */
export type CorrelationExtractor = (...args: unknown[]) => string | undefined;

/**
 * Options for the {@link WithCorrelation} decorator.
 */
export interface CorrelationDecoratorOptions {
  /**
   * Property path (dot-notation) to the correlation ID in the **first argument**.
   *
   * - For Bull: `'data.correlationId'` (default)
   * - For a flat object: `'correlationId'`
   * - For deeply nested: `'metadata.tracing.correlationId'`
   *
   * Ignored when `extract` is provided.
   *
   * @default 'data.correlationId'
   */
  path?: string;

  /**
   * Custom extractor function. Receives all method arguments.
   * Takes precedence over `path`.
   *
   * @example
   * ```ts
   * // RabbitMQ
   * extract: (data, ctx) => ctx.getMessage().properties.correlationId
   *
   * // Kafka
   * extract: (data, ctx) =>
   *   ctx.getMessage().headers?.['x-correlation-id']?.toString()
   * ```
   */
  extract?: CorrelationExtractor;

  /**
   * Log level for the start of the method execution.
   *
   * - Any NestJS {@link LogLevel} value routes to the corresponding
   *   `Logger` method (`'log'`, `'debug'`, `'verbose'`, `'warn'`, `'error'`).
   * - `'none'` suppresses the log message entirely.
   *
   * **When using `nestjs-pino`**, NestJS levels map to pino levels as follows:
   * `'verbose'` → `trace`, `'debug'` → `debug`, `'log'` → `info`, `'warn'` → `warn`,
   * `'error'` → `error`, `'fatal'` → `fatal`.
   * To see `'verbose'` logs, set `level: 'trace'` in `LoggerModule.forRoot`.
   *
   * @default 'debug'
   *
   * @example
   * ```ts
   * // Uses default 'debug' level
   * @WithCorrelation()
   *
   * // Log at 'verbose' level
   * @WithCorrelation({ logLevel: 'verbose' })
   *
   * // Suppress the log message
   * @WithCorrelation({ logLevel: 'none' })
   * ```
   */
  logLevel?: LogLevel | 'none';

  /**
   * Custom logger instance to use instead of the built-in NestJS {@link Logger}.
   *
   * Accepts any object that implements {@link LoggerService}
   * (e.g. a Pino or Winston adapter).
   *
   * @example
   * ```ts
   * @WithCorrelation({ logger: myPinoLogger })
   * async handleJob(job: Job) { ... }
   * ```
   */
  logger?: LoggerService;
}

/**
 * Resolve a dot-notation path on an object.
 * Returns `undefined` for any missing segment or non-string leaf.
 *
 * @internal
 */
function getByPath(obj: unknown, path: string): string | undefined {
  let current = untyped(obj);
  for (const segment of path.split('.')) {
    if (current == null) return undefined;
    current = untyped(current[segment]);
  }
  return typeof current === 'string' ? (current as string) : undefined;
}

/**
 * Queue-agnostic `MethodDecorator` that propagates a correlation ID into the
 * pipeline's async-local correlation context.
 *
 * Place it **under** any transport decorator (`@Process`, `@MessagePattern`,
 * `@EventPattern`, `@Cron`, etc.). It does not replace or interfere with them.
 *
 * **How it works:**
 * 1. Extracts the correlation ID from the method arguments (via `path` or `extract`).
 * 2. Wraps the original method inside {@link runWithCorrelationId}.
 * 3. If the extracted ID is `undefined`, `runWithCorrelationId` falls back to
 *    any parent context, then to `uuidv7()` — so a correlation ID is **always**
 *    available inside the method via {@link getCorrelationId}.
 *
 * **⚠️ Array payloads:**
 * When using the default dot-path extraction, the first argument must be an
 * object (e.g. a Bull `Job`). If it is an array, the dot-path cannot resolve
 * and the decorator emits a `Logger.warn` at runtime. For transports that
 * deliver an array as the first argument, use the `extract` option:
 * ```ts
 * @WithCorrelation({ extract: (items) => items?.[0]?.correlationId })
 * ```
 *
 * Inside the method body, read the active ID with:
 * ```ts
 * import { getCorrelationId } from '@nestjs-pipeline/correlation';
 * const id = getCorrelationId();
 * ```
 *
 * @publicApi
 *
 * @example
 * ```ts
 * // ── Bull (default path: data.correlationId) ──
 * @Process('send-email')
 * @WithCorrelation()
 * async handleSendEmail(job: Job) {
 *   const id = getCorrelationId();
 *   await this.commandBus.execute(new SendEmailCommand(job.data));
 * }
 *
 * // ── Bull with custom key ──
 * @Process('send-sms')
 * @WithCorrelation('data.x-request-id')
 * async handleSendSms(job: Job) { ... }
 *
 * // ── RabbitMQ ──
 * @MessagePattern('user.created')
 * @WithCorrelation({
 *   extract: (data, ctx) => ctx.getMessage().properties.correlationId,
 * })
 * async handle(@Payload() data: any, @Ctx() ctx: RmqContext) { ... }
 *
 * // ── Kafka ──
 * @EventPattern('order.placed')
 * @WithCorrelation({
 *   extract: (data, ctx) =>
 *     ctx.getMessage().headers?.['x-correlation-id']?.toString(),
 * })
 * async handle(@Payload() data: any, @Ctx() ctx: KafkaContext) { ... }
 *
 * // ── PostgreSQL LISTEN/NOTIFY ──
 * @WithCorrelation({ path: 'correlationId' })
 * async onNotification(notification: PgNotification) { ... }
 *
 * // ── Cron (no ID in args → auto-generates uuidv7) ──
 * @Cron('0 * * * *')
 * @WithCorrelation()
 * async hourlySync() { ... }
 * ```
 */
export function WithCorrelation(): MethodDecorator;
export function WithCorrelation(path: string): MethodDecorator;
export function WithCorrelation(
  options: CorrelationDecoratorOptions,
): MethodDecorator;
export function WithCorrelation(
  pathOrOptions?: string | CorrelationDecoratorOptions,
): MethodDecorator {
  const options: CorrelationDecoratorOptions =
    typeof pathOrOptions === 'string'
      ? { path: pathOrOptions }
      : (pathOrOptions ?? {});

  const { path = 'data.correlationId', extract } = options;
  const logger: LoggerService = options.logger ?? new Logger(WithCorrelation.name);

  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value;

    descriptor.value = function (this: unknown, ...args: unknown[]) {
      if (!extract && Array.isArray(args[0])) {
        logger.warn(
          `${untyped(this).constructor?.name}.${String(_propertyKey)}: first argument is an array — ` +
            `dot-path "${path}" cannot extract a correlation ID from it. ` +
            `Use the 'extract' option for array payloads.`,
        );
      }

      const correlationId = extract
        ? extract(...args)
        : getByPath(args[0], path);

      return runWithCorrelationId(correlationId, () => {
        if (options.logLevel !== 'none') {
          const level = options.logLevel ?? 'debug';
          const method = logger[level as keyof LoggerService];
          if (typeof method === 'function') {
            (method as (msg: string) => void).call(
              logger,
              `🔗 Starting ${untyped(this).constructor?.name}.${String(_propertyKey)} with correlationId: ${getCorrelationId()}`,
            );
          }
        }
        return originalMethod.apply(this, args);
      });
    };

    // Preserve function name for stack traces and debugging.
    Object.defineProperty(descriptor.value, 'name', {
      value: originalMethod.name,
      configurable: true,
    });

    return descriptor;
  };
}

/**
 * Pre-built extraction presets for {@link WithCorrelation}.
 *
 * Instead of writing a custom `extract` function for each transport, use
 * a preset to extract the correlation ID from the transport's **native
 * metadata** (AMQP properties, Kafka headers, NATS headers, gRPC metadata).
 *
 * For transports that have no headers (Bull/BullMQ, PostgreSQL NOTIFY),
 * use the bare `@WithCorrelation()` which reads from the data payload.
 *
 * @publicApi
 *
 * @example
 * ```ts
 * // ── RabbitMQ ──
 * @MessagePattern('user.created')
 * @WithCorrelation(CorrelationFrom.amqp())
 * async handle(@Payload() data: any, @Ctx() ctx: RmqContext) { }
 *
 * // ── Kafka ──
 * @EventPattern('order.placed')
 * @WithCorrelation(CorrelationFrom.kafka())
 * async handle(@Payload() data: any, @Ctx() ctx: KafkaContext) { }
 *
 * // ── NATS ──
 * @MessagePattern('user.created')
 * @WithCorrelation(CorrelationFrom.nats())
 * async handle(@Payload() data: any, @Ctx() ctx: NatsContext) { }
 *
 * // ── gRPC ──
 * @GrpcMethod('UsersService', 'FindOne')
 * @WithCorrelation(CorrelationFrom.grpc())
 * async findOne(data: any, metadata: Metadata) { }
 * ```
 */
export const CorrelationFrom = {
  /**
   * RabbitMQ (AMQP) — extracts from `ctx.getMessage().properties.correlationId`.
   *
   * AMQP has a first-class `correlationId` property on the message.
   * On the producer side, set it with:
   * ```ts
   * channel.publish(exchange, key, buffer, { correlationId: getCorrelationId() });
   * ```
   */
  amqp: (): CorrelationDecoratorOptions => ({
    extract: (_data: unknown, ctx: unknown) =>
      dyn(ctx)?.getMessage?.()?.properties?.correlationId as string | undefined,
  }),

  /**
   * Kafka — extracts from `ctx.getMessage().headers[key]`.
   *
   * Kafka headers are `Buffer | string | undefined`. The value is `.toString()`-ed.
   * On the producer side, set it with:
   * ```ts
   * { headers: correlationHeaders() }
   * ```
   *
   * @param header - Header key. Defaults to `'x-correlation-id'`.
   */
  kafka: (header = 'x-correlation-id'): CorrelationDecoratorOptions => ({
    extract: (_data: unknown, ctx: unknown) =>
      dyn(ctx)?.getMessage?.()?.headers?.[header]?.toString(),
  }),

  /**
   * NATS — extracts from `ctx.getHeaders().get(key)`.
   *
   * @param header - Header key. Defaults to `'x-correlation-id'`.
   */
  nats: (header = 'x-correlation-id'): CorrelationDecoratorOptions => ({
    extract: (_data: unknown, ctx: unknown) =>
      dyn(ctx)?.getHeaders?.()?.get?.(header) as string | undefined,
  }),

  /**
   * gRPC — extracts from gRPC `Metadata` (second argument).
   *
   * In NestJS gRPC handlers the signature is `(data, metadata, call)`.
   *
   * @param key - Metadata key. Defaults to `'x-correlation-id'`.
   */
  grpc: (key = 'x-correlation-id'): CorrelationDecoratorOptions => ({
    extract: (_data: unknown, metadata: unknown) => {
      const values = dyn(metadata)?.get?.(key);
      return values?.[0]?.toString();
    },
  }),
} as const;
