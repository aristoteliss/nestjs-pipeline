/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Type } from '@nestjs/common';
import { type BehaviorId, getBehaviorId } from '../helpers/behavior-id';
import type { IPipelineBehavior } from '../interfaces/pipeline.behavior.interface';
import {
  type IPipelineBehaviorContract,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorDiagnostic,
  type PipelineBehaviorValidationContext,
} from '../interfaces/pipeline-behavior-contract.interface';
import { untyped } from '../types/safe-typing';

/**
 * Validates behavior contracts and ordering rules during bootstrap.
 */
export function validateBehaviorContracts(params: {
  handlerType: Type;
  requestKind: 'command' | 'query' | 'event';
  behaviorTypes: Type<IPipelineBehavior>[];
  resolvedBehaviors: Map<number, IPipelineBehavior>;
  mergedOptions: Map<BehaviorId, Record<string, unknown>>;
  handlerOptions?: Map<BehaviorId, Record<string, unknown>>;
  globalOptions: Map<BehaviorId, Record<string, unknown>>;
  handlerBehaviorTypes?: Type<IPipelineBehavior>[];
  globalBehaviorIds: Set<BehaviorId>;
  diagnostics: PipelineBehaviorDiagnostic[];
}): void {
  const {
    handlerType,
    requestKind,
    behaviorTypes,
    resolvedBehaviors,
    mergedOptions,
    handlerOptions,
    globalOptions,
    handlerBehaviorTypes,
    globalBehaviorIds,
    diagnostics,
  } = params;

  for (let i = 0; i < behaviorTypes.length; i++) {
    const BehaviorClass = behaviorTypes[i];
    const id = getBehaviorId(BehaviorClass);
    const instance = resolvedBehaviors.get(i);

    const contract: IPipelineBehaviorContract | undefined =
      (instance &&
        (untyped(instance)[PIPELINE_BEHAVIOR_CONTRACT] as
          | IPipelineBehaviorContract
          | undefined)) ??
      (untyped(BehaviorClass)[PIPELINE_BEHAVIOR_CONTRACT] as
        | IPipelineBehaviorContract
        | undefined);

    if (!contract) continue;

    const isHandlerDeclared = (handlerBehaviorTypes ?? []).some(
      (t) => getBehaviorId(t) === id,
    );
    const isGlobalDeclared = globalBehaviorIds.has(id);
    const declarationSource: 'handler' | 'global' | 'both' =
      isHandlerDeclared && isGlobalDeclared
        ? 'both'
        : isHandlerDeclared
          ? 'handler'
          : 'global';

    const rawMerged = mergedOptions.get(id);
    const effectiveOptions =
      instance &&
      typeof (instance as unknown as { resolveEffectiveOptions?: unknown })
        .resolveEffectiveOptions === 'function'
        ? (
            instance as unknown as {
              resolveEffectiveOptions: (
                opts?: Record<string, unknown>,
              ) => Record<string, unknown>;
            }
          ).resolveEffectiveOptions(rawMerged)
        : rawMerged;

    const validationCtx: PipelineBehaviorValidationContext = {
      handlerType,
      handlerName: handlerType.name,
      requestKind,
      declarationSource,
      effectiveOptions,
      handlerOptions: handlerOptions?.get(id),
      globalOptions: globalOptions.get(id),
      effectiveBehaviorTypes: behaviorTypes,
      behaviorInstance: instance,
    };

    // 1. Validate ordering constraints
    if (contract.order) {
      const orderRule =
        typeof contract.order === 'function'
          ? contract.order(validationCtx)
          : contract.order;

      if (orderRule) {
        const edges: Array<{
          target: Type<IPipelineBehavior> | string;
          direction: 'after' | 'before';
        }> = [];

        if (orderRule.after) {
          for (const target of orderRule.after) {
            edges.push({ target, direction: 'after' });
          }
        }
        if (orderRule.before) {
          for (const target of orderRule.before) {
            edges.push({ target, direction: 'before' });
          }
        }

        for (const { target, direction } of edges) {
          const targetIdx = behaviorTypes.findIndex((b) =>
            typeof target === 'string'
              ? getBehaviorId(b) === target || b.name === target
              : b === target || getBehaviorId(b) === getBehaviorId(target),
          );

          // Relative position only: an absent target has no position to
          // violate. A behavior that needs a peer to exist checks
          // effectiveBehaviorTypes in its own validate().
          if (targetIdx === -1) continue;

          const isViolation =
            direction === 'after' ? i <= targetIdx : i >= targetIdx;
          if (isViolation) {
            const targetName = behaviorTypes[targetIdx].name;
            diagnostics.push({
              handlerName: handlerType.name,
              behaviorName: BehaviorClass.name,
              message:
                direction === 'after'
                  ? `${BehaviorClass.name} is positioned before ${targetName} in the pipeline chain, but must execute after it`
                  : `${BehaviorClass.name} is positioned after ${targetName} in the pipeline chain, but must execute before it`,
              fix:
                direction === 'after'
                  ? `Reorder the pipeline behaviors so that ${targetName} runs before ${BehaviorClass.name}.`
                  : `Reorder the pipeline behaviors so that ${BehaviorClass.name} runs before ${targetName}.`,
            });
          }
        }
      }
    }

    // 2. Validate behavior options and intent
    if (typeof contract.validate === 'function') {
      const result = contract.validate(validationCtx);
      if (Array.isArray(result) && result.length > 0) {
        diagnostics.push(...result);
      }
    }
  }
}
