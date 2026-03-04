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
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { uuidv7 } from 'src';

/**
 * Async-local store that holds the current correlation ID.
 *
 * **How it gets populated:**
 * - **HTTP** — {@link HttpCorrelationMiddleware} reads the configured header
 *   (default `x-correlation-id`) and calls `correlationStore.run()`.
 * - **Non-HTTP** (Bull, RabbitMQ, WebSocket, cron, etc.) — use
 *   {@link runWithCorrelationId} in your processor / handler.
 *
 * **How it is consumed:**
 * The pipeline bootstrap service reads `correlationStore.getStore()` when a
 * command, query, or event handler is invoked. If a value exists it becomes
 * the `correlationId` for that pipeline run; otherwise a `uuidv7()`
 * fallback is generated (timestamp-sortable UUID per RFC 9562).
 *
 * Uses Node.js built-in `AsyncLocalStorage` — zero external dependencies.
 *
 * @example
 * ```ts
 * // Read the current correlation ID anywhere in the call stack
 * const id = correlationStore.getStore(); // string | undefined
 * ```
 */
export const correlationStore = new AsyncLocalStorage<string>();

/**
 * Run a callback within a correlation context.
 *
 * Use this in **non-HTTP entry points** (Bull processors, RabbitMQ handlers,
 * WebSocket gateways, cron jobs, etc.) to propagate an external correlation ID
 * into any CQRS commands or queries dispatched inside the callback.
 *
 * If `correlationId` is `undefined` or empty, `fn` executes without a store
 * and the pipeline will fall back to `uuidv7()`.
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
 * @param correlationId - The correlation ID to propagate. If falsy, `fn` runs without a store.
 * @param fn - The callback to execute within the correlation context.
 */
export function runWithCorrelationId<T>(
  correlationId: string | undefined,
  fn: () => T,
): T {
  const id = correlationId ?? correlationStore.getStore() ?? uuidv7();
  return correlationStore.run(id, fn);
}
