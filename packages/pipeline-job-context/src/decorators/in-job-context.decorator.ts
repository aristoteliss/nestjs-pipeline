/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { parseJobContext } from '../helpers/parse-job-context.js';
import { activeRegistration } from '../helpers/registration.js';

/** Options of {@link InJobContext}. */
export interface InJobContextOptions {
  /**
   * Dot path to the job context in the method's first argument.
   *
   * @default 'data.jobContext' (a BullMQ `Job`)
   */
  path?: string;
}

function readPath(value: unknown, segments: readonly string[]): unknown {
  let current = value;
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Runs a job-processing method inside the context `withJobContext` stamped on
 * its payload: the tenant, the correlation id, and the principal the registered
 * `IJobPrincipal` re-checks and binds. The method becomes async.
 *
 * It fails closed before the method runs: a payload without a context, with a
 * malformed one, with an unconfigured tenant, or with a principal carrying
 * anything beyond `id`, `type` and `sessionId` is refused, and so is a
 * principal `restore` rejects. Place it under the transport decorator.
 *
 * @example
 * ```ts
 * @Processor(WELCOME_EMAIL_QUEUE)
 * export class SendWelcomeEmailProcessor extends WorkerHost {
 *   @InJobContext()
 *   async process(job: Job<WithJobContext<WelcomeEmail>>) {
 *     await this.commandBus.execute(new SendWelcomeEmailCommand(job.data));
 *   }
 * }
 * ```
 */
export function InJobContext(
  options: InJobContextOptions = {},
): MethodDecorator {
  const segments = (options.path ?? 'data.jobContext').split('.');

  return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const { principal, tenants, sources } = activeRegistration();
      const context = parseJobContext(
        readPath(args[0], segments),
        tenants,
        sources.correlationId.accepts,
      );
      return sources.tenantId.run(context.tenantId, () =>
        sources.correlationId.run(context.correlationId, () =>
          principal.restore(context.principal, async () =>
            original.apply(this, args),
          ),
        ),
      );
    };
    Object.defineProperty(descriptor.value, 'name', {
      value: original.name,
      configurable: true,
    });
    return descriptor;
  };
}
