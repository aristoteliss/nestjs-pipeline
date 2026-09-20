/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Type } from '@nestjs/common';
import {
  type BehaviorId,
  getBehaviorId,
  PIPELINE_BEHAVIORS_METADATA,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
  PIPELINE_SKIPPED_BEHAVIORS_METADATA,
  type PipelineBehaviorEntry,
} from '../decorators/pipeline.decorator';
import {
  type BehaviorEntryAccumulators,
  normalizeBehaviorEntries,
} from '../helpers/behavior-entries';
import type { IPipelineBehavior } from '../interfaces/pipeline.behavior.interface';
import type { PipelineModuleOptions } from '../options/pipeline-module.options';

/** Compiles handler declarations without resolving providers or mutating methods. */
export function compilePipelinePlan(
  handlerType: Type,
  requestKind: 'command' | 'query' | 'event',
  options?: PipelineModuleOptions,
) {
  // Handler-specific behaviors from @UsePipeline decorator
  const handlerBehaviorTypes: Type<IPipelineBehavior>[] | undefined =
    Reflect.getMetadata(PIPELINE_BEHAVIORS_METADATA, handlerType);
  const handlerOptions: Map<BehaviorId, Record<string, unknown>> | undefined =
    Reflect.getMetadata(PIPELINE_BEHAVIORS_OPTIONS_METADATA, handlerType);

  // Handler-specific behaviors to skip from @SkipPipeline decorator
  const skippedBehaviorTypes: Type<IPipelineBehavior>[] | undefined =
    Reflect.getMetadata(PIPELINE_SKIPPED_BEHAVIORS_METADATA, handlerType);

  if (skippedBehaviorTypes && skippedBehaviorTypes.length > 0) {
    const handlerBehaviorIds = new Set<BehaviorId>(
      (handlerBehaviorTypes ?? []).map(getBehaviorId),
    );
    for (const skippedType of skippedBehaviorTypes) {
      const id = getBehaviorId(skippedType);
      if (handlerBehaviorIds.has(id) || handlerOptions?.has(id)) {
        throw new Error(
          `Handler ${handlerType.name} has contradictory pipeline configuration: ` +
            `behavior ${skippedType.name} is declared in both @SkipPipeline and @UsePipeline. ` +
            `Remove either the @SkipPipeline or the @UsePipeline declaration.`,
        );
      }
    }
  }

  // Global behaviors for this handler kind
  const { beforeTypes, afterTypes, globalOptions } = resolveGlobalBehaviors(
    options,
    requestKind,
  );

  const skippedBehaviorIds = new Set<BehaviorId>(
    (skippedBehaviorTypes ?? []).map(getBehaviorId),
  );

  const effectiveBeforeTypes = beforeTypes.filter(
    (type) => !skippedBehaviorIds.has(getBehaviorId(type)),
  );
  const effectiveAfterTypes = afterTypes.filter(
    (type) => !skippedBehaviorIds.has(getBehaviorId(type)),
  );

  const hasHandlerBehaviors =
    handlerBehaviorTypes && handlerBehaviorTypes.length > 0;
  const hasGlobalBehaviors =
    effectiveBeforeTypes.length > 0 || effectiveAfterTypes.length > 0;

  const hasPipeline = Boolean(hasHandlerBehaviors || hasGlobalBehaviors);

  // Handler declarations override options for a global behavior of the same
  // class, but must not relocate it. A global security guard configured in
  // `before` must remain outside handler-level cache/idempotency behaviors
  // that can short-circuit without calling next().
  const globalBehaviorIds = new Set<BehaviorId>(
    [...effectiveBeforeTypes, ...effectiveAfterTypes].map(getBehaviorId),
  );
  const handlerOnlyTypes = (handlerBehaviorTypes ?? []).filter(
    (type) => !globalBehaviorIds.has(getBehaviorId(type)),
  );

  // Effective order: globalBefore → non-global handler behaviors → globalAfter.
  // Matching handler entries supply options at their original global position.
  const behaviorTypes: Type<IPipelineBehavior>[] = [
    ...effectiveBeforeTypes,
    ...handlerOnlyTypes,
    ...effectiveAfterTypes,
  ];

  // Handler options shallowly override global options; nested values are replaced.
  const mergedOptions = new Map<BehaviorId, Record<string, unknown>>(
    globalOptions,
  );
  for (const [id, options] of handlerOptions ?? []) {
    const inherited = mergedOptions.get(id);
    mergedOptions.set(id, inherited ? { ...inherited, ...options } : options);
  }
  for (const skippedId of skippedBehaviorIds) {
    mergedOptions.delete(skippedId);
  }

  return {
    behaviorTypes,
    mergedOptions,
    hasPipeline,
    handlerOptions,
    globalOptions,
    handlerBehaviorTypes,
    globalBehaviorIds,
  };
}

/**
 * Resolves global before/after behaviors that match the given handler kind.
 * `globalBehaviors` may be a single `GlobalBehaviorsOptions` object or an array.
 * Each entry is filtered by its `scope` ('all' | 'commands' | 'queries' | 'events').
 * Matching entries are merged — behaviors accumulate across all matching configs.
 *
 * @returns Behavior types to prepend/append plus any inline options from tuple entries.
 */
function resolveGlobalBehaviors(
  options: PipelineModuleOptions | undefined,
  requestKind: 'command' | 'query' | 'event',
): {
  beforeTypes: Type<IPipelineBehavior>[];
  afterTypes: Type<IPipelineBehavior>[];
  globalOptions: Map<BehaviorId, Record<string, unknown>>;
} {
  const empty = {
    beforeTypes: [] as Type<IPipelineBehavior>[],
    afterTypes: [] as Type<IPipelineBehavior>[],
    globalOptions: new Map<BehaviorId, Record<string, unknown>>(),
  };

  const raw = options?.globalBehaviors;
  if (!raw) return empty;

  const configs = Array.isArray(raw) ? raw : [raw];
  if (configs.length === 0) return empty;

  const beforeTypes: Type<IPipelineBehavior>[] = [];
  const afterTypes: Type<IPipelineBehavior>[] = [];

  // One accumulator pair across every matching config and both chain positions,
  // so the first occurrence fixes placement while a later tuple can still
  // supply options without the behavior running more than once.
  const accumulators: BehaviorEntryAccumulators = {
    seen: new Set<BehaviorId>(),
    options: new Map<BehaviorId, Record<string, unknown>>(),
  };

  const parseEntries = (entries: PipelineBehaviorEntry[]) =>
    normalizeBehaviorEntries(
      entries,
      `globalBehaviors for ${requestKind}`,
      true,
      accumulators,
    ).types;

  for (const config of configs) {
    const scope = config.scope ?? 'all';

    // Scope filtering — skip entries that don't match the handler kind
    if (scope === 'commands' && requestKind !== 'command') continue;
    if (scope === 'queries' && requestKind !== 'query') continue;
    if (scope === 'events' && requestKind !== 'event') continue;

    beforeTypes.push(...parseEntries(config.before ?? []));
    afterTypes.push(...parseEntries(config.after ?? []));
  }

  return { beforeTypes, afterTypes, globalOptions: accumulators.options };
}
