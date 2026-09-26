/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Type } from '@nestjs/common';
import { DeadLetterRedriveError } from './errors/dead-letter-redrive.error';
import { runAsRedrive } from './helpers/redrive-scope';
import type {
  DeadLetterRecord,
  DeadLetterRequestKind,
  DeadLetterStore,
} from './interfaces/dead-letter-transport.interface';

/**
 * Sends a rebuilt request back for handling. It must settle only when the
 * handling has finished, and reject when it failed.
 *
 * For an event, run only the handler that failed (`record.handlerName`):
 * publishing the event again would also rerun the handlers that succeeded.
 */
export type DeadLetterDispatch = (
  request: unknown,
  record: DeadLetterRecord,
) => Promise<unknown> | unknown;

/** Options of {@link DeadLetterRedriver}. */
export interface DeadLetterRedriverOptions {
  /**
   * The request classes that may be redriven, matched by class name against
   * `record.requestName`. A record of any other name is refused.
   */
  requestTypes: readonly Type[];
  /** How to dispatch a rebuilt request, per request kind. */
  dispatch: Partial<Record<DeadLetterRequestKind, DeadLetterDispatch>>;
  /**
   * Builds the request from a record. Default: an instance of the registered
   * class with the stored payload's fields, without running its constructor.
   * Required to redrive a record whose payload was redacted: it must restore
   * the redacted values.
   */
  rebuild?: (record: DeadLetterRecord, requestType: Type) => unknown;
}

/** Outcome of a successful {@link DeadLetterRedriver.redrive}. */
export interface DeadLetterRedriveResult {
  id: string;
  /** What the dispatch returned. */
  response: unknown;
}

/**
 * Redrives dead letters kept by a {@link DeadLetterStore}: rebuilds the
 * request, dispatches it, then marks the record resolved — or, when the
 * handling fails again, counts the attempt, keeps its error, and rethrows it.
 * During a redrive, `DeadLetterBehavior` neither captures the failure again
 * nor swallows it.
 *
 * The package does not depend on `@nestjs/cqrs`, so the application supplies
 * the dispatch functions:
 *
 * @example
 * ```ts
 * {
 *   provide: DeadLetterRedriver,
 *   inject: [DEAD_LETTER_TRANSPORT, CommandBus, ModuleRef],
 *   useFactory: (store: PostgresDeadLetterTransport, commandBus: CommandBus, moduleRef: ModuleRef) =>
 *     new DeadLetterRedriver(store, {
 *       requestTypes: [SendWelcomeEmailCommand, UserCreatedEvent],
 *       dispatch: {
 *         command: (command) => commandBus.execute(command as ICommand),
 *         // Only the failed handler, not every subscriber of the event.
 *         event: (event, record) =>
 *           moduleRef.get(eventHandlers[record.handlerName], { strict: false }).handle(event),
 *       },
 *     }),
 * }
 * ```
 */
export class DeadLetterRedriver {
  private readonly types: ReadonlyMap<string, Type>;

  constructor(
    private readonly store: DeadLetterStore,
    private readonly options: DeadLetterRedriverOptions,
  ) {
    this.types = new Map(options.requestTypes.map((type) => [type.name, type]));
  }

  /**
   * Redrives the dead letter `id`.
   *
   * @throws DeadLetterRedriveError when it cannot be redriven; nothing is dispatched.
   * @throws The handling error when the redrive fails; the attempt is counted.
   */
  async redrive(id: string): Promise<DeadLetterRedriveResult> {
    const record = await this.store.get(id);
    if (!record) throw new DeadLetterRedriveError(id, 'no such dead letter');
    if (record.status === 'resolved') {
      throw new DeadLetterRedriveError(id, 'it is already resolved');
    }
    const requestType = this.types.get(record.requestName);
    if (!requestType) {
      throw new DeadLetterRedriveError(
        id,
        `request type ${record.requestName} is not registered in requestTypes`,
      );
    }
    const dispatch = this.options.dispatch[record.requestKind];
    if (!dispatch) {
      throw new DeadLetterRedriveError(
        id,
        `no dispatch is configured for ${record.requestKind} requests`,
      );
    }
    if (record.payloadRedacted && !this.options.rebuild) {
      throw new DeadLetterRedriveError(
        id,
        'its payload was redacted; configure rebuild to restore the redacted values',
      );
    }

    const request = this.options.rebuild
      ? this.options.rebuild(record, requestType)
      : Object.assign(
          Object.create(requestType.prototype),
          record.payload as object,
        );

    let response: unknown;
    try {
      response = await runAsRedrive(id, () => dispatch(request, record));
    } catch (error) {
      await this.store.recordAttempt(id, {
        name: error instanceof Error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    await this.store.markResolved(id);
    return { id, response };
  }

  /** Closes the dead letter `id` without replaying it. */
  resolve(id: string): Promise<void> {
    return this.store.markResolved(id);
  }
}
