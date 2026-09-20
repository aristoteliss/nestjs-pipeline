/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  Inject,
  Injectable,
  Logger,
  LogLevel,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
  Type,
} from '@nestjs/common';
import { type ContextId, ContextIdFactory, ModuleRef } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { AsyncContext } from '@nestjs/cqrs';
import { ExplorerService } from '@nestjs/cqrs/dist/services/explorer.service';
import {
  pipelineStore,
  SET_CORRELATION_ID,
  SET_ORIGINAL_CORRELATION_ID,
  SET_RESPONSE,
  SET_TENANT_ID,
} from '../constants/pipeline-context.constants';
import {
  type BehaviorId,
  getBehaviorId,
  PIPELINE_BEHAVIORS_METADATA,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
  PIPELINE_SKIPPED_BEHAVIORS_METADATA,
  PipelineBehaviorEntry,
} from '../decorators/pipeline.decorator';
import { uuidv7 } from '../helpers/uuidv7';
import {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import {
  type IPipelineBehaviorContract,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorDiagnostic,
  type PipelineBehaviorValidationContext,
  PipelineConfigurationError,
} from '../interfaces/pipeline-behavior-contract.interface';
import { PipelineHandlerMeta } from '../interfaces/pipeline-handler-meta.interface';
import {
  PIPELINE_MODULE_OPTIONS,
  PipelineModuleOptions,
} from '../options/pipeline-module.options';
import { PipelineContext } from '../pipeline.context';
import { untyped } from '../types/safe-typing';

type PipelineRunner = (self: unknown, request: unknown) => Promise<unknown>;

interface PrototypeMethodEntry {
  originalMethod: (this: unknown, request: unknown) => unknown;
  runners: Map<PipelineBootstrapService, PipelineRunner>;
}

const prototypeRegistry = new WeakMap<
  object,
  Map<string | symbol, PrototypeMethodEntry>
>();
const instanceRunnerMap = new WeakMap<object, PipelineRunner>();

/**
 * Logger for the shared prototype dispatcher.
 *
 * The dispatcher is installed on a prototype and outlives any single
 * `PipelineBootstrapService`, so it cannot use that instance's logger.
 */
const bootstrapLogger = new Logger('PipelineBootstrapService', {
  timestamp: true,
});

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
/**
 * Whether a `moduleRef.get()` failure means "this provider is scoped" rather
 * than "this provider does not exist".
 *
 * Nest raises `InvalidClassScopeException` for the first and
 * `UnknownElementException` for the second. Both are internal classes, so they
 * are recognized structurally — by class name, with a message fallback — rather
 * than imported across the private-API boundary this package otherwise keeps to
 * `ExplorerService`.
 *
 * Anything unrecognized is treated as a real failure, because the safe direction
 * here is to fail the bootstrap: deferring an unknown error to per-request
 * resolution turns a startup problem into a runtime one.
 */
function isScopedProviderError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if (error.constructor?.name === 'InvalidClassScopeException') return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    message.includes('is marked as a scoped provider')
  );
}

@Injectable()
export class PipelineBootstrapService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PipelineBootstrapService.name, {
    timestamp: true,
  });
  private bootstrapLogLevel!: LogLevel | 'none';
  private readonly unwrappers: Array<() => void> = [];

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

    const collectedDiagnostics: PipelineBehaviorDiagnostic[] = [];

    // Already categorized by kind — no detectKind() or resolveMethodName() needed
    for (const wrapper of commands) {
      this.wrapIfDecorated(wrapper, 'command', 'execute', collectedDiagnostics);
    }
    for (const wrapper of queries) {
      this.wrapIfDecorated(wrapper, 'query', 'execute', collectedDiagnostics);
    }
    for (const wrapper of events) {
      this.wrapIfDecorated(wrapper, 'event', 'handle', collectedDiagnostics);
    }

    const diagnosticsMode = this.options?.diagnostics ?? 'strict';
    if (collectedDiagnostics.length > 0 && diagnosticsMode !== 'off') {
      if (diagnosticsMode === 'warn') {
        for (const d of collectedDiagnostics) {
          this.logger.warn(
            `[Pipeline Diagnostic] Handler '${d.handlerName}' with behavior '${d.behaviorName}': ${d.message}. Fix: ${d.fix}`,
          );
        }
      } else {
        throw new PipelineConfigurationError(collectedDiagnostics);
      }
    }
  }

  onModuleDestroy() {
    while (this.unwrappers.length > 0) {
      const unwrap = this.unwrappers.pop();
      try {
        unwrap?.();
      } catch (error) {
        this.logger.warn(
          `Failed to unwrap pipeline handler during module destroy: ${error}`,
        );
      }
    }
  }

  /**
   * Checks whether the handler declares pipeline behaviors and/or matches global
   * behavior configuration, precomputes the effective chain, then wraps the
   * handler method. Singleton behaviors are captured at bootstrap; any dynamic
   * behavior slots are resolved per invocation with the active Nest context ID.
   *
   * Effective order: `[globalBefore] → [@UsePipeline] → [globalAfter] → handler`.
   * A handler declaration of an already-global behavior overrides its options
   * without relocating it, preserving security-sensitive outer guards.
   *
   * @param wrapper     - The NestJS InstanceWrapper for this provider
   * @param requestKind - Handler kind from ExplorerService categorization
   * @param methodName  - Method name to wrap ('execute' | 'handle')
   */
  private wrapIfDecorated(
    wrapper: InstanceWrapper,
    requestKind: 'command' | 'query' | 'event',
    methodName: 'execute' | 'handle',
    diagnostics?: PipelineBehaviorDiagnostic[],
  ): void {
    // Scoped handlers may only expose their class through wrapper.metatype at bootstrap.
    const handlerType: Type | undefined =
      (wrapper.metatype as Type) ?? (wrapper.instance?.constructor as Type);
    if (!handlerType) return;

    // Match Nest CQRS' own handler-resolution decision. A DEFAULT-scoped
    // handler becomes contextual when any dependency in its tree is
    // request-scoped (scope bubbling), even though wrapper.scope remains
    // Scope.DEFAULT.
    const isScoped = !wrapper.isDependencyTreeStatic();

    // For singleton handlers, verify the instance exists
    const instance = isScoped ? undefined : wrapper.instance;
    if (!isScoped && !instance) return;

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
    const { beforeTypes, afterTypes, globalOptions } =
      this.resolveGlobalBehaviors(requestKind);

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
    // Scoped prototypes are shared across applications, including those with no behaviors.
    if (!hasPipeline && !isScoped) return;

    // Handler declarations override options for a global behavior of the same
    // class, but must not relocate it. A global security guard configured in
    // `before` must remain outside handler-level cache/idempotency behaviors
    // that can short-circuit without calling next().
    //
    // Identity defaults to the constructor reference, which is exact. Keying on
    // the class name made two unrelated classes that happen to share a name —
    // easily one per module — collapse into a single behavior, running only one
    // of them and applying the other's options. A class that must be recognized
    // across two loaded copies of its own package opts into a stable string via
    // the [PIPELINE_BEHAVIOR_ID] static.
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

    // For scoped handlers, wrap the prototype so every per-request instance
    // gets the pipelined method. For singletons, wrap the instance directly.
    const target = isScoped ? handlerType.prototype : instance;
    let originalMethod: (this: unknown, request: unknown) => unknown;
    let methodMap: Map<string | symbol, PrototypeMethodEntry> | undefined;
    let entry: PrototypeMethodEntry | undefined;

    if (isScoped) {
      methodMap = prototypeRegistry.get(target);
      if (!methodMap) {
        methodMap = new Map();
        prototypeRegistry.set(target, methodMap);
      }
      entry = methodMap.get(methodName);
      if (entry) {
        if (entry.runners.has(this)) return;
        originalMethod = entry.originalMethod;
      } else {
        originalMethod = target[methodName];
        if (typeof originalMethod !== 'function') return;
        if (untyped(originalMethod).__pipelined) return;
      }
    } else {
      originalMethod = target[methodName];
      if (typeof originalMethod !== 'function') return;
      if (untyped(originalMethod).__pipelined) return;
    }

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
      } catch (error) {
        if (!isScopedProviderError(error)) {
          // Every lookup failure used to be reclassified as a scoping problem, so
          // an unregistered behavior survived bootstrap and failed on the first
          // request instead — far from the module that forgot to provide it.
          throw new Error(
            `${BehaviorClass.name} could not be resolved from the Nest container. ` +
              'Register it as a provider — in PipelineModule.forRoot({ behaviors }), ' +
              'PipelineModule.forFeature([...]), or any module that is part of the ' +
              'application graph. This is a registration failure, not a scoping one.',
            { cause: error },
          );
        }

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

    // 2. Build handler metadata (kind, name, options) — computed once.
    //    A handler inherits its behavior's global options and patches the fields
    //    it names, field by field: `{ ...global, ...handler }`.
    //
    //    Both halves of that were once wrong. A bare `@UsePipeline(Behavior)`
    //    cleared the global options, so redeclaring a globally configured
    //    behavior — the natural way to say "yes, this handler too" — silently
    //    reverted it to package defaults. And a handler tuple replaced the global
    //    object wholesale, so with TraceBehavior configured globally as
    //    `[TraceBehavior, { tracerName: 'users-api', recordRequest: true }]`,
    //    narrowing one field meant restating every other one or losing it.
    //
    //    The merge is one level deep. A nested object such as `retry` is a value
    //    like any other: naming it replaces it entirely, which keeps "what does
    //    this handler run with" answerable by reading two objects instead of
    //    walking a tree. To run a behavior on package defaults despite a global
    //    configuration, state those values explicitly — inheritance no longer has
    //    an off switch, because a silent one is what caused the first bug.
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

    const meta: PipelineHandlerMeta = {
      handlerType,
      handlerName: handlerType.name,
      requestKind,
      behaviorOptions: mergedOptions.size > 0 ? mergedOptions : undefined,
    };

    const diagnosticsMode = this.options?.diagnostics ?? 'strict';
    if (diagnostics && diagnosticsMode !== 'off') {
      for (let i = 0; i < behaviorTypes.length; i++) {
        const BehaviorClass = behaviorTypes[i];
        const id = getBehaviorId(BehaviorClass);

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

        const contract = untyped(BehaviorClass)[PIPELINE_BEHAVIOR_CONTRACT] as
          | IPipelineBehaviorContract
          | undefined;

        if (contract) {
          // 1. Validate Ordering Constraints
          if (contract.order) {
            if (contract.order.after) {
              for (const target of contract.order.after) {
                const targetIdx = behaviorTypes.findIndex((b) =>
                  typeof target === 'string'
                    ? getBehaviorId(b) === target || b.name === target
                    : b === target ||
                      getBehaviorId(b) === getBehaviorId(target),
                );
                if (targetIdx !== -1 && i <= targetIdx) {
                  const targetName =
                    typeof target === 'string' ? target : target.name;
                  diagnostics.push({
                    handlerName: handlerType.name,
                    behaviorName: BehaviorClass.name,
                    message: `${BehaviorClass.name} is positioned before ${targetName} in the pipeline chain, but must execute after it`,
                    fix: `Reorder the pipeline behaviors so that ${targetName} runs before ${BehaviorClass.name}.`,
                  });
                }
              }
            }
            if (contract.order.before) {
              for (const target of contract.order.before) {
                const targetIdx = behaviorTypes.findIndex((b) =>
                  typeof target === 'string'
                    ? getBehaviorId(b) === target || b.name === target
                    : b === target ||
                      getBehaviorId(b) === getBehaviorId(target),
                );
                if (targetIdx !== -1 && i >= targetIdx) {
                  const targetName =
                    typeof target === 'string' ? target : target.name;
                  diagnostics.push({
                    handlerName: handlerType.name,
                    behaviorName: BehaviorClass.name,
                    message: `${BehaviorClass.name} is positioned after ${targetName} in the pipeline chain, but must execute before it`,
                    fix: `Reorder the pipeline behaviors so that ${BehaviorClass.name} runs before ${targetName}.`,
                  });
                }
              }
            }
          }

          // 2. Validate Behavior Options & Intent
          if (typeof contract.validate === 'function') {
            const validationCtx: PipelineBehaviorValidationContext = {
              handlerType,
              handlerName: handlerType.name,
              requestKind,
              declarationSource,
              effectiveOptions: mergedOptions.get(id),
              handlerOptions: handlerOptions?.get(id),
              globalOptions: globalOptions.get(id),
              effectiveBehaviorTypes: behaviorTypes,
            };

            const result = contract.validate(validationCtx);
            if (Array.isArray(result) && result.length > 0) {
              diagnostics.push(...result);
            }
          }
        }
      }
    }

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
    const tenantIdFactory = this.options?.tenantIdFactory;

    // 3. Construct runner and replace method.
    //    Dynamic behavior slots are resolved inside each invocation.
    //    For scoped handlers the prototype is patched via a dispatcher that routes
    //    to the active application runner and restores on OnModuleDestroy.
    const runner: PipelineRunner = async (
      self: unknown,
      request: unknown,
    ): Promise<unknown> => {
      if (!hasPipeline) return originalMethod.call(self, request);

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
            ? AsyncContext.of(request)?.id
            : undefined;
        const contextId =
          cqrsContextId ??
          ContextIdFactory.getByRequest(
            (self ?? request) as Record<string, unknown>,
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

      if (!context.correlationId) {
        context[SET_CORRELATION_ID](correlationIdFactory?.() ?? uuidv7());
      }
      context[SET_ORIGINAL_CORRELATION_ID](context.correlationId);

      if (!context.tenantId && tenantIdFactory) {
        const resolvedTenantId = tenantIdFactory();
        if (resolvedTenantId !== undefined) {
          context[SET_TENANT_ID](resolvedTenantId);
        }
      }

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

    if (isScoped) {
      if (!entry) {
        entry = {
          originalMethod,
          runners: new Map(),
        };
        if (!methodMap)
          throw new Error('Scoped pipeline method registry is missing');
        methodMap.set(methodName, entry);

        const currentTarget = target;
        const currentMethodName = methodName;
        const fallbackMethod = originalMethod;

        const pipelinedDispatcher = async function (
          this: unknown,
          request: unknown,
        ): Promise<unknown> {
          const map = prototypeRegistry.get(currentTarget);
          const currentEntry = map?.get(currentMethodName);
          if (!currentEntry || currentEntry.runners.size === 0) {
            return fallbackMethod.call(this, request);
          }

          const activeRunner =
            this && typeof this === 'object'
              ? instanceRunnerMap.get(this)
              : undefined;

          if (activeRunner) return activeRunner(this, request);

          // The prototype is shared by every application in the process. With a
          // single application there is exactly one runner and no ambiguity, so
          // an instance created outside the patched Nest context still gets its
          // pipeline.
          const allRunners = Array.from(currentEntry.runners.values());
          if (allRunners.length === 1) {
            return allRunners[0](this, request);
          }

          // With several applications, the previous "most recently registered
          // wins" rule could run a request in application A through application
          // B's chain — B's global behaviors, tenant factory and correlation
          // runner. Running unwrapped loses the pipeline for this call instead
          // of applying an unrelated one, and the warning makes it diagnosable
          // rather than silent.
          bootstrapLogger.warn(
            `${String(currentMethodName)}() ran without its pipeline: ${allRunners.length} ` +
              'applications share this handler prototype and the instance is not ' +
              'registered to any of them, so the correct chain cannot be identified.',
          );
          return fallbackMethod.call(this, request);
        };

        untyped(pipelinedDispatcher).__pipelined = true;
        target[methodName] = pipelinedDispatcher;
      }

      entry.runners.set(this, runner);

      const origGetInstance = wrapper.getInstanceByContextId;
      const origSetInstance = wrapper.setInstanceByContextId;

      if (typeof origGetInstance === 'function') {
        wrapper.getInstanceByContextId = function (
          this: InstanceWrapper,
          contextId: ContextId,
          inquirerId?: string,
        ) {
          const host = origGetInstance.call(this, contextId, inquirerId);
          if (host?.instance && typeof host.instance === 'object') {
            instanceRunnerMap.set(host.instance, runner);
          }
          return host;
        };
      }

      if (typeof origSetInstance === 'function') {
        wrapper.setInstanceByContextId = function (
          this: InstanceWrapper,
          contextId: ContextId,
          value: Parameters<InstanceWrapper['setInstanceByContextId']>[1],
          inquirerId?: string,
        ) {
          origSetInstance.call(this, contextId, value, inquirerId);
          if (value?.instance && typeof value.instance === 'object') {
            instanceRunnerMap.set(value.instance, runner);
          }
        };
      }

      this.unwrappers.push(() => {
        if (typeof origGetInstance === 'function') {
          wrapper.getInstanceByContextId = origGetInstance;
        }
        if (typeof origSetInstance === 'function') {
          wrapper.setInstanceByContextId = origSetInstance;
        }

        const map = prototypeRegistry.get(target);
        const currentEntry = map?.get(methodName);
        if (currentEntry) {
          currentEntry.runners.delete(this);
          if (currentEntry.runners.size === 0) {
            target[methodName] = currentEntry.originalMethod;
            delete untyped(target[methodName]).__pipelined;
            map?.delete(methodName);
          }
        }
      });
    } else {
      const pipelinedMethod = async function (
        this: unknown,
        request: unknown,
      ): Promise<unknown> {
        return runner(this, request);
      };

      untyped(pipelinedMethod).__pipelined = true;
      target[methodName] = pipelinedMethod;

      this.unwrappers.push(() => {
        target[methodName] = originalMethod;
        delete untyped(target[methodName]).__pipelined;
      });
    }
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
    globalOptions: Map<BehaviorId, Record<string, unknown>>;
  } {
    const empty = {
      beforeTypes: [] as Type<IPipelineBehavior>[],
      afterTypes: [] as Type<IPipelineBehavior>[],
      globalOptions: new Map<BehaviorId, Record<string, unknown>>(),
    };

    const raw = this.options?.globalBehaviors;
    if (!raw) return empty;

    const configs = Array.isArray(raw) ? raw : [raw];
    if (configs.length === 0) return empty;

    const globalOptions = new Map<BehaviorId, Record<string, unknown>>();
    const beforeTypes: Type<IPipelineBehavior>[] = [];
    const afterTypes: Type<IPipelineBehavior>[] = [];

    // Deduplicate across all matching configs and both chain positions. The
    // first occurrence determines placement; later tuples may still override
    // its options without causing the behavior to run more than once.
    const globalIds = new Set<BehaviorId>();

    const parseEntries = (
      entries: PipelineBehaviorEntry[],
      seenIds: Set<BehaviorId>,
    ): Type<IPipelineBehavior>[] => {
      const types: Type<IPipelineBehavior>[] = [];
      for (const entry of entries) {
        const type = Array.isArray(entry) ? entry[0] : entry;
        const id = getBehaviorId(type);
        if (Array.isArray(entry)) {
          // Later matching configuration supplies the effective options.
          globalOptions.set(id, entry[1] as Record<string, unknown>);
        }
        // A bare duplicate only ensures inclusion. It must not erase options
        // supplied by a tuple in another matching global configuration.
        if (!seenIds.has(id)) {
          seenIds.add(id);
          types.push(type);
        }
      }
      return types;
    };

    for (const config of configs) {
      const scope = config.scope ?? 'all';

      // Scope filtering — skip entries that don't match the handler kind
      if (scope === 'commands' && requestKind !== 'command') continue;
      if (scope === 'queries' && requestKind !== 'query') continue;
      if (scope === 'events' && requestKind !== 'event') continue;

      beforeTypes.push(...parseEntries(config.before ?? [], globalIds));
      afterTypes.push(...parseEntries(config.after ?? [], globalIds));
    }

    return { beforeTypes, afterTypes, globalOptions };
  }
}
