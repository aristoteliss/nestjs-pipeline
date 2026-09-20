/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Type } from '@nestjs/common';
import type { IPipelineBehavior } from './pipeline.behavior.interface';

/**
 * Well-known symbol for declaring an optional {@link IPipelineBehaviorContract}
 * on a pipeline behavior class.
 */
export const PIPELINE_BEHAVIOR_CONTRACT = Symbol.for(
  '@nestjs-pipeline/behavior-contract',
);

/**
 * Inspection context provided to behavior contract validators during application bootstrap.
 */
export interface PipelineBehaviorValidationContext {
  /** The CQRS handler class. */
  handlerType: Type;
  /** The name of the CQRS handler. */
  handlerName: string;
  /** The request kind of the handler ('command' | 'query' | 'event'). */
  requestKind: 'command' | 'query' | 'event';
  /**
   * Source where this behavior was declared for the current handler:
   * - `'handler'`: declared explicitly via `@UsePipeline(...)` on the handler class.
   * - `'global'`: declared globally in `PipelineModule.forRoot({ globalBehaviors })`.
   * - `'both'`: declared globally and also customized via `@UsePipeline(...)` on the handler.
   */
  declarationSource: 'handler' | 'global' | 'both';
  /** Effective options for resolved singletons; raw handler/global options for scoped behaviors. */
  effectiveOptions: Record<string, unknown> | undefined;
  /** Raw options declared on the handler, if any. */
  handlerOptions: Record<string, unknown> | undefined;
  /** Raw options declared globally, if any. */
  globalOptions: Record<string, unknown> | undefined;
  /** Complete ordered list of effective behavior classes active for this handler. */
  effectiveBehaviorTypes: ReadonlyArray<Type<IPipelineBehavior>>;
  /** The pre-resolved singleton behavior instance, when available during bootstrap. */
  behaviorInstance?: IPipelineBehavior;
}

/**
 * A diagnostic issue identified during bootstrap validation of a pipeline behavior.
 */
export interface PipelineBehaviorDiagnostic {
  /** The name of the handler where the issue occurred. */
  handlerName: string;
  /** The name of the behavior that emitted the diagnostic. */
  behaviorName: string;
  /** Actionable explanation of the invalid or missing configuration. */
  message: string;
  /** Concrete remediation recommendation to resolve the issue. */
  fix: string;
}

/**
 * Static ordering constraints relative to other pipeline behaviors.
 */
export interface PipelineBehaviorOrderRule {
  /** This behavior must execute before the specified behaviors. */
  before?: Array<Type<IPipelineBehavior> | string>;
  /** This behavior must execute after the specified behaviors. */
  after?: Array<Type<IPipelineBehavior> | string>;
}

/**
 * Ordering specification: either a static rule or a dynamic rule evaluated per handler context.
 */
export type PipelineBehaviorOrder =
  | PipelineBehaviorOrderRule
  | ((
      context: PipelineBehaviorValidationContext,
    ) => PipelineBehaviorOrderRule | undefined);

/**
 * Declarative contract exposed by a behavior class to define ordering constraints
 * and bootstrap-time validation rules.
 */
export interface IPipelineBehaviorContract {
  /**
   * Relative ordering constraints against other behaviors in the pipeline.
   * Targets can be behavior classes or behavior ID / class names (strings).
   * Can be a static rule or a function evaluated with the handler context
   * to restrict constraints to applicable request kinds or configurations.
   */
  order?: PipelineBehaviorOrder;
  /**
   * Validates effective options and declaration sources during bootstrap.
   * Returns an array of diagnostics if deterministic misconfigurations are found.
   */
  validate?: (
    context: PipelineBehaviorValidationContext,
  ) => PipelineBehaviorDiagnostic[] | undefined;
}

/**
 * Thrown during NestJS application bootstrap when deterministic pipeline policy
 * misconfigurations or ordering violations are detected.
 */
export class PipelineConfigurationError extends Error {
  constructor(
    public readonly diagnostics: readonly PipelineBehaviorDiagnostic[],
  ) {
    const formatted = diagnostics
      .map(
        (d, idx) =>
          `  ${idx + 1}. [${d.handlerName} -> ${d.behaviorName}] ${d.message}. Fix: ${d.fix}`,
      )
      .join('\n');
    super(
      `Pipeline configuration invalid at bootstrap with ${diagnostics.length} error(s):\n${formatted}`,
    );
    this.name = 'PipelineConfigurationError';
  }
}
