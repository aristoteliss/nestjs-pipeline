/* Copyright (C) 2026-present Aristotelis — see repository license. */

export * from './behaviors/logging.behavior';
export {
  pipelineStore,
  SET_TENANT_ID,
} from './constants/pipeline-context.constants';
export * from './decorators';
export { MissingPartitionError } from './errors/missing-partition.error';
export * from './errors/missing-pipeline-item.error';
export {
  type LoggingIntentOptions,
  logging,
} from './helpers/logging.intent';
export { toPostgresJson } from './helpers/postgres-json';
export {
  type TenantPartitionOptions,
  tenantSegments,
} from './helpers/tenant-partition';
export type {
  ContextSource,
  ContextSources,
  CorrelationSource,
} from './interfaces/context-source.interface';
export * from './interfaces/pipeline.behavior.interface';
export * from './interfaces/pipeline.context.interface';
export * from './interfaces/pipeline-behavior-contract.interface';
export * from './interfaces/pipeline-handler-meta.interface';
export type {
  GlobalBehaviorScope,
  GlobalBehaviorsOptions,
  PipelineLoggerProvider,
  PipelineModuleAsyncOptions,
  PipelineModuleFeatureOptions,
  PipelineModuleOptions,
  PipelineOptionsFactory,
} from './options';
export * from './pipeline.context';
export * from './pipeline.module';
export * from './pipeline-items';
