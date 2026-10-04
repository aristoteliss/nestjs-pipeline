/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type Constructor,
  type ContextSources,
  compilePipelinePlan,
  createPipelineRunner,
  type DeclaredKind,
  type GlobalBehaviorsOptions,
  type IPipelineBehavior,
  type PipelineBehaviorDiagnostic,
  PipelineConfigurationError,
  pipelineOf,
  validateBehaviorContracts,
} from '@cqrs-ddd/pipeline';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { CommandHandler, EventsHandler, QueryHandler } from '@nestjs/cqrs';

/** What every handler's pipeline shares. */
export interface PipelineOptions {
  readonly globalBehaviors?: GlobalBehaviorsOptions | GlobalBehaviorsOptions[];
  readonly sources?: ContextSources;
  /** `'strict'` (default) fails startup on a contract violation, `'warn'` logs it. */
  readonly diagnostics?: 'strict' | 'warn' | 'off';
}

export const PIPELINE_OPTIONS = Symbol('PIPELINE_OPTIONS');

type Provider = ReturnType<DiscoveryService['getProviders']>[number];

// @nestjs/cqrs keeps its handler metadata keys private, so each public handler
// decorator is applied to a throwaway class to read the one key it records.
function metadataKey(decorate: (target: Constructor) => void): unknown {
  const target = class {};
  decorate(target);
  const keys: unknown[] = Reflect.getOwnMetadataKeys(target);
  if (keys.length !== 1) {
    throw new Error(
      'A @nestjs/cqrs handler decorator recorded no single metadata key; the installed @nestjs/cqrs is not supported.',
    );
  }
  return keys[0];
}

const HANDLER_KINDS: ReadonlyArray<[unknown, DeclaredKind]> = [
  [metadataKey((target) => CommandHandler(class {})(target)), 'command'],
  [metadataKey((target) => QueryHandler(class {})(target)), 'query'],
  [metadataKey((target) => EventsHandler(class {})(target)), 'event'],
];

/**
 * Wraps every `@nestjs/cqrs` handler that runs behaviors with its pipeline, at
 * application bootstrap: `execute` of command and query handlers, `handle` of
 * event handlers. The buses read the method at call time, so they dispatch
 * through the pipeline unchanged.
 *
 * A handler's pipeline comes from its `@UsePipeline`/`@SkipPipeline` and the
 * global behaviors, compiled once. Each behavior instance is the one provider a
 * module registers under the behavior class; this provider never builds one.
 * Startup fails when a behavior has no provider or several, when a handler that
 * runs behaviors is request-scoped (Nest builds such a handler per request, so a
 * wrapped instance would never run), and, in `'strict'` mode, when a behavior's
 * contract is broken. Only this application's own handler instances are wrapped,
 * never their class, and they are restored when the application closes.
 */
@Injectable()
export class PipelineBootstrap
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PipelineBootstrap.name);
  private readonly restores: Array<() => void> = [];

  constructor(
    private readonly discovery: DiscoveryService,
    @Inject(PIPELINE_OPTIONS) private readonly options: PipelineOptions,
  ) {}

  onApplicationBootstrap(): void {
    try {
      this.wrapHandlers();
    } catch (error) {
      this.onModuleDestroy();
      throw error;
    }
  }

  onModuleDestroy(): void {
    while (this.restores.length > 0) this.restores.pop()?.();
  }

  private wrapHandlers(): void {
    const providers = this.discovery.getProviders();
    const mode = this.options.diagnostics ?? 'strict';
    const found: PipelineBehaviorDiagnostic[] = [];
    const behaviors = new Map<Constructor, IPipelineBehavior>();
    const behavior = (
      type: Constructor<IPipelineBehavior>,
      handler: string,
    ) => {
      let instance = behaviors.get(type);
      if (!instance) {
        instance = registeredBehavior(providers, type, handler);
        behaviors.set(type, instance);
      }
      return instance;
    };

    for (const provider of providers) {
      const type = handlerType(provider);
      if (!type) continue;
      for (const [key, kind] of HANDLER_KINDS) {
        if (!Reflect.getMetadata(key, type)) continue;
        this.wrap(
          provider,
          type,
          kind,
          behavior,
          mode === 'off' ? undefined : found,
        );
      }
    }

    if (found.length > 0 && mode === 'strict') {
      throw new PipelineConfigurationError(found);
    }
    for (const d of found) {
      this.logger.warn(
        `[Pipeline Diagnostic] Handler '${d.handlerName}' with behavior '${d.behaviorName}': ${d.message}. Fix: ${d.fix}`,
      );
    }
  }

  private wrap(
    provider: Provider,
    type: Constructor,
    kind: DeclaredKind,
    behavior: (
      type: Constructor<IPipelineBehavior>,
      handler: string,
    ) => IPipelineBehavior,
    diagnostics: PipelineBehaviorDiagnostic[] | undefined,
  ): void {
    const handlerName = type.name;
    const declared = pipelineOf(type);
    const plan = compilePipelinePlan({
      handlerName,
      requestKind: kind,
      handlerBehaviorTypes: declared.types,
      handlerOptions: declared.options,
      skippedBehaviorTypes: declared.skipped,
      globalBehaviors: this.options.globalBehaviors,
    });
    if (!plan.hasPipeline) return;
    if (!provider.isDependencyTreeStatic()) {
      throw new Error(
        `${handlerName} runs pipeline behaviors but is request-scoped, itself or through a dependency; ` +
          'Nest builds it per request, so its pipeline would never run. Make it a singleton and read ' +
          'request data from async context.',
      );
    }

    const method = kind === 'event' ? 'handle' : 'execute';
    const instance = provider.instance as Record<string, unknown>;
    const original = instance[method] as (
      this: unknown,
      ...args: unknown[]
    ) => unknown;

    const resolved = plan.behaviorTypes.map((t) => behavior(t, handlerName));
    if (diagnostics) {
      validateBehaviorContracts({
        ...plan,
        handlerType: type,
        handlerName,
        requestKind: kind,
        resolvedBehaviors: new Map(resolved.map((b, i) => [i, b])),
        diagnostics,
      });
    }
    this.logger.debug(
      `Wrapping ${handlerName}.${method}() [${kind}] with pipeline: [${plan.behaviorTypes.map((t) => t.name).join(' → ')}]`,
    );

    const run = createPipelineRunner(
      original,
      {
        handlerType: type,
        handlerName,
        requestKind: kind,
        behaviorOptions:
          plan.mergedOptions.size > 0 ? plan.mergedOptions : undefined,
      },
      resolved,
      true,
      this.options.sources,
    );
    const own = Object.getOwnPropertyDescriptor(instance, method);
    Object.defineProperty(instance, method, {
      configurable: true,
      writable: true,
      value: (request: unknown) => run(instance, request),
    });
    this.restores.push(() => {
      if (own) Object.defineProperty(instance, method, own);
      else Reflect.deleteProperty(instance, method);
    });
  }
}

function handlerType(provider: Provider): Constructor | undefined {
  const type =
    (provider.instance as object | undefined)?.constructor ?? provider.metatype;
  return typeof type === 'function' && type !== Object
    ? (type as Constructor)
    : undefined;
}

function registeredBehavior(
  providers: readonly Provider[],
  type: Constructor<IPipelineBehavior>,
  handler: string,
): IPipelineBehavior {
  const registered = providers.filter((provider) => provider.token === type);
  if (registered.length === 0) {
    throw new Error(
      `${type.name} runs in the pipeline of ${handler}, but no module provides it. Register it as a ` +
        'provider of the module that configures it.',
    );
  }
  if (registered.length > 1) {
    const modules = registered.map((p) => p.host?.name ?? 'an unknown module');
    throw new Error(
      `${type.name} is provided by ${modules.join(' and ')}; exactly one module provides each behavior, ` +
        'otherwise which instance a handler gets would depend on import order.',
    );
  }
  const [provider] = registered;
  if (!provider.isDependencyTreeStatic() || !provider.instance) {
    throw new Error(
      `${type.name} must be a singleton provider: a pipeline takes one instance of each behavior.`,
    );
  }
  return provider.instance as IPipelineBehavior;
}
