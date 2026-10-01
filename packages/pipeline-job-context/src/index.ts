/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  AsSystem,
  type AsSystemOptions,
} from './decorators/as-system.decorator.js';
export {
  InJobContext,
  type InJobContextOptions,
} from './decorators/in-job-context.decorator.js';
export { InvalidJobContextError } from './errors/invalid-job-context.error.js';
export { MissingJobContextError } from './errors/missing-job-context.error.js';
export { withJobContext } from './helpers/with-job-context.js';
export type {
  ContextSource,
  CorrelationSource,
  JobContextSources,
} from './interfaces/context-source.interface.js';
export type {
  JobContext,
  WithJobContext,
} from './interfaces/job-context.interface.js';
export type { JobContextOptions } from './interfaces/job-context-options.interface.js';
export type { IJobPrincipal } from './interfaces/job-principal.interface.js';
export type { PrincipalReference } from './interfaces/principal-reference.interface.js';
export { JobContextModule } from './job-context.module.js';
