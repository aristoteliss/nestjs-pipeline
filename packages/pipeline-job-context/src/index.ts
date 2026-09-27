/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  AsSystem,
  type AsSystemOptions,
} from './decorators/as-system.decorator';
export {
  InJobContext,
  type InJobContextOptions,
} from './decorators/in-job-context.decorator';
export { InvalidJobContextError } from './errors/invalid-job-context.error';
export { MissingJobContextError } from './errors/missing-job-context.error';
export { withJobContext } from './helpers/with-job-context';
export type {
  JobContext,
  WithJobContext,
} from './interfaces/job-context.interface';
export type { JobContextOptions } from './interfaces/job-context-options.interface';
export type { IJobPrincipal } from './interfaces/job-principal.interface';
export type { PrincipalReference } from './interfaces/principal-reference.interface';
export { JobContextModule } from './job-context.module';
