/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * A value kept for the current execution by the package that owns it, such as
 * the tenant of `@nestjs-pipeline/tenant`. A pipeline reads it when it starts
 * and runs its behaviors inside it, so nested dispatches inherit it.
 */
export interface ContextSource {
  /** The value of the current execution, or `undefined` for none. */
  current(): string | undefined;
  /**
   * Runs `fn` with `value` as the current value (`undefined`: none) for
   * everything it calls, synchronously or asynchronously.
   */
  run<T>(value: string | undefined, fn: () => T): T;
}

/** A correlation id source, which also makes new ids. */
export interface CorrelationSource extends ContextSource {
  /** A new correlation id, for a pipeline started without one. */
  create(): string;
}

/**
 * Where pipelines take their tenant and correlation id from
 * (`PipelineModule.forRoot({ sources })`).
 *
 * Without a source, a pipeline takes the value of the pipeline it is nested
 * in, if any. A missing correlation id comes from the correlation source's
 * `create()`, or, with no correlation source, from `uuidv7()`.
 *
 * @example
 * ```ts
 * import { correlationSource } from '@nestjs-pipeline/correlation';
 * import { tenantSource } from '@nestjs-pipeline/tenant';
 *
 * PipelineModule.forRoot({
 *   sources: { tenantId: tenantSource, correlationId: correlationSource },
 * });
 * ```
 */
export interface ContextSources {
  readonly tenantId?: ContextSource;
  readonly correlationId?: CorrelationSource;
}
