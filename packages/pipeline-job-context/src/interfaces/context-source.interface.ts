/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * A value kept for the current execution by the package that owns it, such as
 * `tenantSource` of `@nestjs-pipeline/tenant`.
 */
export interface ContextSource {
  /** The value of the current execution, or `undefined` for none. */
  current(): string | undefined;
  /** Runs `fn` with `value` as the current value for everything it calls. */
  run<T>(value: string | undefined, fn: () => T): T;
}

/** A correlation id source that also makes new ids and judges ids received from outside. */
export interface CorrelationSource extends ContextSource {
  /** A new correlation id. */
  create(): string;
  /** Whether `id`, read from a job payload, is a well-formed correlation id. */
  accepts(id: string): boolean;
}

/** The tenant and correlation id a job carries and restores. */
export interface JobContextSources {
  readonly tenantId: ContextSource;
  readonly correlationId: CorrelationSource;
}
