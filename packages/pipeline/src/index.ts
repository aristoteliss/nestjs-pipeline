/* Copyright (C) 2026-present Aristotelis — see repository license. */

export * from './behaviors/logging.behavior.js';
export {
  pipelineStore,
  SET_TENANT_ID,
} from './constants/pipeline-context.constants.js';
export * from './decorators/index.js';
export { MissingPartitionError } from './errors/missing-partition.error.js';
export * from './errors/missing-pipeline-item.error.js';
export {
  type LoggingIntentOptions,
  logging,
} from './helpers/logging.intent.js';
export { toPostgresJson } from './helpers/postgres-json.js';
export {
  type TenantPartitionOptions,
  tenantSegments,
} from './helpers/tenant-partition.js';
export type {
  ContextSource,
  ContextSources,
  CorrelationSource,
} from './interfaces/context-source.interface.js';
export * from './interfaces/pipeline.behavior.interface.js';
export * from './interfaces/pipeline.context.interface.js';
export * from './interfaces/pipeline-behavior-contract.interface.js';
export * from './interfaces/pipeline-handler-meta.interface.js';
export type {
  GlobalBehaviorScope,
  GlobalBehaviorsOptions,
  PipelineLoggerProvider,
  PipelineModuleAsyncOptions,
  PipelineModuleFeatureOptions,
  PipelineModuleOptions,
  PipelineOptionsFactory,
} from './options/index.js';
export * from './pipeline.context.js';
export * from './pipeline.module.js';
export * from './pipeline-items.js';
