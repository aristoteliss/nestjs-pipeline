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
import { IPipelineBehavior } from '../interfaces/pipeline.behavior.interface';
import {
  type PipelineBehaviorDiagnostic,
  PipelineConfigurationError,
} from '../interfaces/pipeline-behavior-contract.interface';
import { PipelineHandlerMeta } from '../interfaces/pipeline-handler-meta.interface';
import {
  PIPELINE_MODULE_OPTIONS,
  PipelineModuleOptions,
} from '../options/pipeline-module.options';
import { untyped } from '../types/safe-typing';
import { validateBehaviorContracts } from './pipeline-contracts';
import { compilePipelinePlan } from './pipeline-plan';
import { createPipelineRunner, type PipelineRunner } from './pipeline-runner';

interface PrototypeMethodEntry {
  originalMethod: (this: unknown, request: unknown) => unknown;
  descriptor: PropertyDescriptor | undefined;
  runners: Map<PipelineBootstrapService, PipelineRunner>;
}

const prototypeRegistry = new WeakMap<
  object,
  Map<string | symbol, PrototypeMethodEntry>
>();
const instanceRunnerMap = new WeakMap<
  object,
  Map<string, { target: object; runner: PipelineRunner }>
>();

function bindRunner(
  instance: object,
  methodName: string,
  target: object,
  runner: PipelineRunner,
): void {
  let methods = instanceRunnerMap.get(instance);
  if (!methods) {
    methods = new Map();
    instanceRunnerMap.set(instance, methods);
  }
  methods.set(methodName, { target, runner });
}

function originalHandlerMethod(target: object, methodName: string): unknown {
  for (
    let owner: object | null = target;
    owner;
    owner = Object.getPrototypeOf(owner)
  ) {
    const entry = prototypeRegistry.get(owner)?.get(methodName);
    if (entry) return entry.originalMethod;
    if (Object.hasOwn(owner, methodName)) return Reflect.get(owner, methodName);
  }
  return undefined;
}

function restoreMethod(
  target: object,
  methodName: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) Object.defineProperty(target, methodName, descriptor);
  else Reflect.deleteProperty(target, methodName);
}

// Recognize Nest's scoped-provider error without importing another private class.
// Unknown lookup failures must fail bootstrap instead of deferring to a request.
function isScopedProviderError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if (error.constructor?.name === 'InvalidClassScopeException') return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    message.includes('is marked as a scoped provider')
  );
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

    try {
      const explorer = this.moduleRef.get(ExplorerService, { strict: false });
      const { commands = [], queries = [], events = [] } = explorer.explore();

      const collectedDiagnostics: PipelineBehaviorDiagnostic[] = [];

      for (const wrapper of commands) {
        this.wrapIfDecorated(
          wrapper,
          'command',
          'execute',
          collectedDiagnostics,
        );
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
    } catch (error) {
      this.onModuleDestroy();
      throw error;
    }
  }

  onModuleDestroy() {
    while (this.unwrappers.length > 0) {
      const unwrap = this.unwrappers.pop();
      try {
        unwrap?.();
      } catch (error) {
        this.logger.warn(
          `Failed to unwrap pipeline handler during cleanup: ${error}`,
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
    diagnostics: PipelineBehaviorDiagnostic[],
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

    const instance = isScoped ? undefined : wrapper.instance;
    if (!isScoped && !instance) return;

    const plan = compilePipelinePlan(handlerType, requestKind, this.options);
    const { behaviorTypes, mergedOptions, hasPipeline } = plan;
    // Scoped prototypes are shared with applications that have no behaviors.
    if (!hasPipeline && !isScoped) return;

    // For scoped handlers, wrap the prototype so every per-request instance
    // gets the pipelined method. For singletons, wrap the instance directly.
    const target = isScoped ? handlerType.prototype : instance;
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      target,
      methodName,
    );
    let originalMethod: (this: unknown, request: unknown) => unknown;
    let entry = isScoped
      ? prototypeRegistry.get(target)?.get(methodName)
      : undefined;

    if (entry) {
      if (entry.runners.has(this)) return;
      originalMethod = entry.originalMethod;
    } else {
      originalMethod = originalHandlerMethod(
        target,
        methodName,
      ) as typeof originalMethod;
      if (typeof originalMethod !== 'function') return;
      if (untyped(originalMethod).__pipelined) return;
    }

    // Resolve singleton behavior instances once. Behaviors that are scoped
    // (or otherwise unavailable through moduleRef.get) are resolved per run.
    const resolvedBehaviors = new Map<number, IPipelineBehavior>();

    for (let i = 0; i < behaviorTypes.length; i++) {
      const BehaviorClass = behaviorTypes[i];
      let instance: IPipelineBehavior | undefined;

      try {
        instance = this.moduleRef.get(BehaviorClass, { strict: false });
      } catch (error) {
        if (!isScopedProviderError(error)) {
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

    const meta: PipelineHandlerMeta = {
      handlerType,
      handlerName: handlerType.name,
      requestKind,
      behaviorOptions: mergedOptions.size > 0 ? mergedOptions : undefined,
    };

    if (this.options?.diagnostics !== 'off') {
      validateBehaviorContracts({
        handlerType,
        requestKind,
        resolvedBehaviors,
        ...plan,
        diagnostics,
      });
    }

    if (this.bootstrapLogLevel !== 'none') {
      this.logger[this.bootstrapLogLevel](
        `Wrapping ${meta.handlerName}.${methodName}() ` +
          `[${requestKind}${isScoped ? ', scoped' : ''}] with pipeline: [${behaviorTypes.map((b) => b.name).join(' → ')}]`,
      );
    }

    const moduleRef = this.moduleRef;
    const runner = createPipelineRunner(
      originalMethod,
      meta,
      resolvedBehaviors.size === behaviorTypes.length
        ? [...resolvedBehaviors.values()]
        : async (self, request) => {
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

            return Promise.all(
              behaviorTypes.map(
                (BehaviorClass, i) =>
                  resolvedBehaviors.get(i) ??
                  moduleRef.resolve<IPipelineBehavior>(
                    BehaviorClass,
                    contextId,
                    {
                      strict: false,
                    },
                  ),
              ),
            );
          },
      hasPipeline,
      this.options,
    );

    if (isScoped) {
      if (!entry) {
        let methodMap = prototypeRegistry.get(target);
        if (!methodMap) {
          methodMap = new Map();
          prototypeRegistry.set(target, methodMap);
        }
        entry = {
          originalMethod,
          descriptor: originalDescriptor,
          runners: new Map(),
        };

        const pipelinedDispatcher = async function (
          this: unknown,
          request: unknown,
        ): Promise<unknown> {
          const map = prototypeRegistry.get(target);
          const currentEntry = map?.get(methodName);
          if (!currentEntry || currentEntry.runners.size === 0) {
            return originalMethod.call(this, request);
          }

          const activeRunner =
            this && typeof this === 'object'
              ? instanceRunnerMap.get(this)?.get(methodName)
              : undefined;

          if (activeRunner) {
            // A super call must invoke the ancestor method, not reenter the child chain.
            return activeRunner.target === target
              ? activeRunner.runner(this, request)
              : originalMethod.call(this, request);
          }

          // The prototype is shared by every application in the process. With a
          // single application there is exactly one runner and no ambiguity, so
          // an instance created outside the patched Nest context still gets its
          // pipeline.
          const allRunners = Array.from(currentEntry.runners.values());
          if (allRunners.length === 1) {
            return allRunners[0](this, request);
          }

          // Unowned instances cannot select safely between application-specific
          // chains, and running unwrapped would bypass every guard in them.
          throw new Error(
            `${String(methodName)}() refused to run without its pipeline: ` +
              `${allRunners.length} applications share this handler prototype and ` +
              'the instance is not registered to any of them. Dispatch it through ' +
              "the owning application's CQRS bus.",
          );
        };

        untyped(pipelinedDispatcher).__pipelined = true;
        target[methodName] = pipelinedDispatcher;
        methodMap.set(methodName, entry);
      }

      entry.runners.set(this, runner);
      const registeredEntry = entry;

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
            bindRunner(host.instance, methodName, target, runner);
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
            bindRunner(value.instance, methodName, target, runner);
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

        registeredEntry.runners.delete(this);
        if (registeredEntry.runners.size === 0) {
          restoreMethod(target, methodName, registeredEntry.descriptor);
          prototypeRegistry.get(target)?.delete(methodName);
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
      bindRunner(target, methodName, target, runner);

      this.unwrappers.push(() => {
        restoreMethod(target, methodName, originalDescriptor);
        instanceRunnerMap.get(target)?.delete(methodName);
      });
    }
  }
}
