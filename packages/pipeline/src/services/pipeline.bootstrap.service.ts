/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import {
  Inject,
  Injectable,
  Logger,
  LogLevel,
  OnApplicationBootstrap,
  Optional,
  Type,
} from '@nestjs/common';
import { type ContextId, ContextIdFactory, ModuleRef } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import * as cqrs from '@nestjs/cqrs';
import { ExplorerService } from '@nestjs/cqrs/dist/services/explorer.service';
import {
  pipelineStore,
  SET_ORIGINAL_CORRELATION_ID,
  SET_RESPONSE,
} from '../constants/pipeline-context.constants';
import {
  getBehaviorId,
  PIPELINE_BEHAVIORS_METADATA,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
  PipelineBehaviorEntry,
} from '../decorators/pipeline.decorator';
import { uuidv7 } from '../helpers/uuidv7';
import {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import { PipelineHandlerMeta } from '../interfaces/pipeline-handler-meta.interface';
import {
  PIPELINE_MODULE_OPTIONS,
  PipelineModuleOptions,
} from '../options/pipeline-module.options';
import { PipelineContext } from '../pipeline.context';
import { untyped } from '../types/safe-typing';

type CqrsWithOptionalAsyncContext = {
  AsyncContext?: {
    of?(target: object): { id: ContextId } | undefined;
  };
};

/**
 * Reads the CQRS async context when the installed CQRS version supports it.
 * `AsyncContext` was added after CQRS 10, which remains a supported peer.
 *
 * @internal Exported only so the compatibility branch can be unit tested.
 */
export function getAttachedCqrsContextId(
  target: object,
  cqrsModule: unknown = cqrs,
): ContextId | undefined {
  const asyncContext = (cqrsModule as CqrsWithOptionalAsyncContext)
    .AsyncContext;
  return typeof asyncContext?.of === 'function'
    ? asyncContext.of(target)?.id
    : undefined;
}

/**
 * At application bootstrap, this service:
 * 1. Discovers all CQRS handlers via ExplorerService (commands, queries, events)
 * 2. Finds handlers decorated with @UsePipeline(...) or matched by global behaviors
 * 3. Precomputes handler metadata and resolves singleton behavior instances
 * 4. Wraps each matching handler method with the effective behavior chain
 *
 * Request-independent metadata (request kind, handler name, behavior options and
 * effective behavior types) is computed once and captured in the wrapper closure.
 * Singleton behaviors are also resolved once at bootstrap and reused. Behaviors
 * that cannot be resolved as singletons are marked dynamic and resolved with
 * `moduleRef.resolve()` for each invocation using the applicable Nest context ID.
 * Therefore the common all-singleton path avoids runtime reflection and DI
 * lookups, while request-scoped/transient behaviors retain their Nest lifecycle.
 *
 * Supports:
 *   - Command handlers  → wraps `execute(command)`
 *   - Query handlers    → wraps `execute(query)`
 *   - Event handlers    → wraps `handle(event)`
 *   - Scoped handlers   → wraps `prototype[method]` so per-request instances inherit it
 */
@Injectable()
export class PipelineBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PipelineBootstrapService.name, {
    timestamp: true,
  });
  private bootstrapLogLevel!: LogLevel | 'none';

  constructor(
    private readonly moduleRef: ModuleRef,
    @Optional()
    @Inject(PIPELINE_MODULE_OPTIONS)
    private readonly options?: PipelineModuleOptions,
  ) {}

  onApplicationBootstrap() {
    this.bootstrapLogLevel = this.options?.bootstrapLogLevel ?? 'debug';

    const explorer = this.moduleRef.get(ExplorerService, { strict: false });
    const { commands = [], queries = [], events = [] } = explorer.explore();

    // Already categorized by kind — no detectKind() or resolveMethodName() needed
    for (const wrapper of commands) {
      this.wrapIfDecorated(wrapper, 'command', 'execute');
    }
    for (const wrapper of queries) {
      this.wrapIfDecorated(wrapper, 'query', 'execute');
    }
    for (const wrapper of events) {
      this.wrapIfDecorated(wrapper, 'event', 'handle');
    }
  }

  /**
   * Checks whether the handler declares pipeline behaviors and/or matches global
   * behavior configuration, precomputes the effective chain, then wraps the
   * handler method. Singleton behaviors are captured at bootstrap; any dynamic
   * behavior slots are resolved per invocation with the active Nest context ID.
   *
   * Effective order: `[globalBefore] → [@UsePipeline] → [globalAfter] → handler`
   *
   * @param wrapper     - The NestJS InstanceWrapper for this provider
   * @param requestKind - Handler kind from ExplorerService categorization
   * @param methodName  - Method name to wrap ('execute' | 'handle')
   */
  private wrapIfDecorated(
    wrapper: InstanceWrapper,
    requestKind: 'command' | 'query' | 'event',
    methodName: 'execute' | 'handle',
  ): void {
    // Determine handler class — works for both singleton and scoped handlers.
    // For scoped handlers (REQUEST / TRANSIENT), wrapper.instance is undefined
    // at bootstrap time, so we read the class from wrapper.metatype instead.
    const handlerType: Type | undefined =
      (wrapper.metatype as Type) ?? (wrapper.instance?.constructor as Type);
    if (!handlerType) return;

    // Scope.DEFAULT = 0 (falsy), Scope.REQUEST = 2, Scope.TRANSIENT = 1 (truthy)
    const isScoped = !!untyped(wrapper).scope;

    // For singleton handlers, verify the instance exists
    const instance = isScoped ? undefined : wrapper.instance;
    if (!isScoped && !instance) return;

    // Handler-specific behaviors from @UsePipeline decorator
    const handlerBehaviorTypes: Type<IPipelineBehavior>[] | undefined =
      Reflect.getMetadata(PIPELINE_BEHAVIORS_METADATA, handlerType);

    // Global behaviors for this handler kind
    const { beforeTypes, afterTypes, globalOptions } =
      this.resolveGlobalBehaviors(requestKind);

    const hasHandlerBehaviors =
      handlerBehaviorTypes && handlerBehaviorTypes.length > 0;
    const hasGlobalBehaviors = beforeTypes.length > 0 || afterTypes.length > 0;

    if (!hasHandlerBehaviors && !hasGlobalBehaviors) return;

    // Handler behaviors override global behaviors of the same class.
    // Any global (before/after) entry whose class also appears in the handler
    // declaration is dropped — only the handler's entry (with handler options) runs.
    //
    // getBehaviorId() is used instead of reference equality (fails across monorepo
    // double-module loads) or plain .name (collides for different classes that share
    // a name). Developers can set a static [PIPELINE_BEHAVIOR_ID] on their class
    // for a guaranteed unique identity; otherwise .name is the fallback.
    const handlerBehaviorIds = new Set<string>(
      (handlerBehaviorTypes ?? []).map(getBehaviorId),
    );
    const filteredBeforeTypes = beforeTypes.filter(
      (t) => !handlerBehaviorIds.has(getBehaviorId(t)),
    );
    const filteredAfterTypes = afterTypes.filter(
      (t) => !handlerBehaviorIds.has(getBehaviorId(t)),
    );

    // Effective order: filteredGlobalBefore → handlerBehaviors → filteredGlobalAfter
    const behaviorTypes: Type<IPipelineBehavior>[] = [
      ...filteredBeforeTypes,
      ...(handlerBehaviorTypes ?? []),
      ...filteredAfterTypes,
    ];

    // For scoped handlers, wrap the prototype so every per-request instance
    // gets the pipelined method. For singletons, wrap the instance directly.
    const target = isScoped ? handlerType.prototype : instance;
    const originalMethod = target[methodName];
    if (typeof originalMethod !== 'function') return;

    // Guard against double-wrapping (e.g. HMR re-bootstrap)
    if (untyped(originalMethod).__pipelined) return;

    // ── Pre-resolve everything at bootstrap ──

    // 1. Resolve singleton behavior instances once. Behaviors that are scoped
    //    (or otherwise unavailable through moduleRef.get) are resolved per run.
    const resolvedBehaviors = new Map<number, IPipelineBehavior>();
    const dynamicIndices = new Set<number>();

    for (let i = 0; i < behaviorTypes.length; i++) {
      const BehaviorClass = behaviorTypes[i];
      let instance: IPipelineBehavior | undefined;

      try {
        instance = this.moduleRef.get(BehaviorClass, { strict: false });
      } catch {
        // Request-scoped/transient provider: resolve with a context ID per invocation.
        this.logger.warn(
          `${BehaviorClass.name} could not be resolved as singleton — will resolve per-request`,
        );
        dynamicIndices.add(i);
        continue;
      }

      if (!instance) {
        throw new Error(
          `${BehaviorClass.name} resolved to a falsy value via moduleRef.get(). ` +
            `Check its provider registration — this is not a scoping issue.`,
        );
      }

      resolvedBehaviors.set(i, instance);
    }

    // 2. Build handler metadata (kind, name, options) — computed once
    //    Merge global options with handler-specific options (handler wins on conflict)
    const handlerOptions: Map<string, Record<string, unknown>> | undefined =
      Reflect.getMetadata(PIPELINE_BEHAVIORS_OPTIONS_METADATA, handlerType);

    const mergedOptions = new Map<string, Record<string, unknown>>([
      ...globalOptions,
      ...(handlerOptions ?? []),
    ]);

    const meta: PipelineHandlerMeta = {
      handlerType,
      handlerName: handlerType.name,
      requestKind,
      behaviorOptions: mergedOptions.size > 0 ? mergedOptions : undefined,
    };

    if (this.bootstrapLogLevel !== 'none') {
      this.logger[this.bootstrapLogLevel](
        `Wrapping ${meta.handlerName}.${methodName}() ` +
          `[${requestKind}${isScoped ? ', scoped' : ''}] with pipeline: [${behaviorTypes.map((b) => b.name).join(' → ')}]`,
      );
    }

    // Pre-capture singleton behavior array once — avoids allocating a new
    // array on every invocation in the common all-singletons fast path.
    // When dynamic indices exist, short-circuit to [] since this array won't be used.
    const singletonBehaviors =
      dynamicIndices.size === 0
        ? behaviorTypes.map((_, i) => {
            const behavior = resolvedBehaviors.get(i);
            if (!behavior) {
              throw new Error(
                `Expected singleton behavior at index ${i} to be pre-resolved during bootstrap.`,
              );
            }
            return behavior;
          })
        : [];

    const moduleRef = this.moduleRef;
    const correlationIdFactory = this.options?.correlationIdFactory;
    const correlationIdRunner = this.options?.correlationIdRunner;

    // 3. Replace method — closure captures pre-resolved singleton behaviors and
    //    metadata. Dynamic behavior slots are resolved inside each invocation.
    //    For scoped handlers the prototype is patched, so every per-request
    //    instance created by the DI container inherits the pipelined method.
    target[methodName] = async function pipelinedMethod(
      this: unknown,
      request: unknown,
    ): Promise<unknown> {
      const context = new PipelineContext(request, meta);

      // Build per-invocation array — singleton slots reused, request-scoped freshly resolved.
      // The captured singleton instances are never mutated; dynamic instances
      // are local to this invocation, preventing cross-request state leaks.
      let localBehaviors: IPipelineBehavior[];
      if (dynamicIndices.size > 0) {
        // CQRS request-scoped handlers are resolved by CommandBus/QueryBus/EventBus
        // with an AsyncContext attached to the command/query/event. Reuse that
        // exact context id for dynamic behaviors so handler and behaviors share
        // request-scoped dependencies (transactions, tenant context, etc.).
        const cqrsContextId =
          request && typeof request === 'object'
            ? getAttachedCqrsContextId(request)
            : undefined;
        const contextId =
          cqrsContextId ??
          ContextIdFactory.getByRequest(
            (this ?? request) as Record<string, unknown>,
          );

        localBehaviors = await Promise.all(
          behaviorTypes.map((BehaviorClass, i) => {
            if (dynamicIndices.has(i)) {
              return moduleRef.resolve<IPipelineBehavior>(
                BehaviorClass,
                contextId,
                { strict: false },
              );
            }
            const behavior = resolvedBehaviors.get(i);
            if (!behavior) {
              throw new Error(
                `Expected singleton behavior at index ${i} to be pre-resolved during bootstrap.`,
              );
            }
            return Promise.resolve(behavior);
          }),
        );
      } else {
        // Fast path — all singletons, reuse pre-captured array (zero allocation)
        localBehaviors = singletonBehaviors;
      }

      // Eagerly resolve correlationId BEFORE any behavior runs.
      // Priority: parent context (saga) > correlationIdFactory > uuidv7()
      if (!context.correlationId) {
        context.correlationId = correlationIdFactory?.() ?? uuidv7();
      }

      // Lock the original value — immutable from this point forward.
      context[SET_ORIGINAL_CORRELATION_ID](context.correlationId);

      // Build chain: behavior[0] → behavior[1] → ... → originalMethod
      // biome-ignore lint/complexity/noUselessThisAlias: Use `this` so the correct instance is called for both singletons (captured instance === this) and scoped handlers (per-request instance).
      const self = this;
      let chain: NextDelegate = async () => {
        const result = await originalMethod.call(self, request);
        context[SET_RESPONSE](result);
        return result;
      };

      for (let i = localBehaviors.length - 1; i >= 0; i--) {
        const behavior = localBehaviors[i];
        const nextInChain = chain;
        chain = () => behavior.handle(context, nextInChain);
      }

      // Run inside the pipeline async-local store so child handlers
      // (saga / nested dispatch) inherit the correlation ID.
      // When correlationIdRunner is provided, also wrap in the correlation
      // store so getCorrelationId() returns the pipeline's correlation ID.
      const runChain = () => pipelineStore.run(context, chain);
      if (correlationIdRunner) {
        return correlationIdRunner(context.correlationId, runChain);
      }
      return runChain();
    };

    // Mark as pipelined to prevent double-wrapping on HMR re-bootstrap
    untyped(target[methodName]).__pipelined = true;
  }

  // ── Global behavior resolution ──

  /**
   * Resolves global before/after behaviors that match the given handler kind.
   * `globalBehaviors` may be a single `GlobalBehaviorsOptions` object or an array.
   * Each entry is filtered by its `scope` ('all' | 'commands' | 'queries' | 'events').
   * Matching entries are merged — behaviors accumulate across all matching configs.
   *
   * @returns Behavior types to prepend/append plus any inline options from tuple entries.
   */
  private resolveGlobalBehaviors(requestKind: 'command' | 'query' | 'event'): {
    beforeTypes: Type<IPipelineBehavior>[];
    afterTypes: Type<IPipelineBehavior>[];
    globalOptions: Map<string, Record<string, unknown>>;
  } {
    const empty = {
      beforeTypes: [] as Type<IPipelineBehavior>[],
      afterTypes: [] as Type<IPipelineBehavior>[],
      globalOptions: new Map<string, Record<string, unknown>>(),
    };

    const raw = this.options?.globalBehaviors;
    if (!raw) return empty;

    const configs = Array.isArray(raw) ? raw : [raw];
    if (configs.length === 0) return empty;

    const globalOptions = new Map<string, Record<string, unknown>>();
    const beforeTypes: Type<IPipelineBehavior>[] = [];
    const afterTypes: Type<IPipelineBehavior>[] = [];

    const parseEntries = (
      entries: PipelineBehaviorEntry[],
    ): Type<IPipelineBehavior>[] =>
      entries.map((entry) => {
        if (Array.isArray(entry)) {
          globalOptions.set(getBehaviorId(entry[0]), entry[1]);
          return entry[0];
        }
        return entry;
      });

    for (const config of configs) {
      const scope = config.scope ?? 'all';

      // Scope filtering — skip entries that don't match the handler kind
      if (scope === 'commands' && requestKind !== 'command') continue;
      if (scope === 'queries' && requestKind !== 'query') continue;
      if (scope === 'events' && requestKind !== 'event') continue;

      beforeTypes.push(...parseEntries(config.before ?? []));
      afterTypes.push(...parseEntries(config.after ?? []));
    }

    return { beforeTypes, afterTypes, globalOptions };
  }
}
