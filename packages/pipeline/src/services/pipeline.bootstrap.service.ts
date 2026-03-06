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
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
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
import { ModuleRef } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { PIPELINE_BEHAVIORS_METADATA, PIPELINE_BEHAVIORS_OPTIONS_METADATA, PipelineBehaviorEntry, getBehaviorId } from '../decorators/pipeline.decorator';
import { IPipelineBehavior, NextDelegate } from '../interfaces/pipeline.behavior.interface';
import { PipelineContext } from '../pipeline.context';
import { PipelineHandlerMeta } from '../interfaces/pipeline-handler-meta.interface';
import { pipelineStore, SET_ORIGINAL_CORRELATION_ID, SET_RESPONSE } from '../constants/pipeline-context.constants';
import { PIPELINE_MODULE_OPTIONS, PipelineModuleOptions } from '../options/pipeline-module.options';
import { GlobalBehaviorsOptions } from '../options/global-behaviors.options';
import { uuidv7 } from '../helpers/uuidv7';
import { ExplorerService } from '@nestjs/cqrs/dist/services/explorer.service';

/**
 * At application bootstrap, this service:
 * 1. Discovers all CQRS handlers via ExplorerService (commands, queries, events)
 * 2. Finds handlers decorated with @UsePipeline(...) or matched by global behaviors
 * 3. Pre-resolves all behavior instances and handler metadata
 * 4. Wraps their execution method with the declared behavior chain
 *
 * Everything that can be computed once (behavior instances, request kind,
 * handler name, behavior options) is resolved at bootstrap and captured
 * in a closure — zero reflection or DI lookups at request time.
 *
 * Supports:
 *   - Command handlers  → wraps `execute(command)`
 *   - Query handlers    → wraps `execute(query)`
 *   - Event handlers    → wraps `handle(event)`
 *   - Scoped handlers   → wraps `prototype[method]` so per-request instances inherit it
 */
@Injectable()
export class PipelineBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PipelineBootstrapService.name, { timestamp: true });
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
   * Checks if the handler is decorated with @UsePipeline and/or has matching
   * global behaviors, then wraps its method with the combined behavior chain.
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
    const isScoped = !!(wrapper as any).scope;

    // For singleton handlers, verify the instance exists
    const instance = isScoped ? undefined : wrapper.instance;
    if (!isScoped && !instance) return;

    // Handler-specific behaviors from @UsePipeline decorator
    const handlerBehaviorTypes: Type<IPipelineBehavior>[] | undefined =
      Reflect.getMetadata(PIPELINE_BEHAVIORS_METADATA, handlerType);

    // Global behaviors for this handler kind
    const { beforeTypes, afterTypes, globalOptions } =
      this.resolveGlobalBehaviors(requestKind);

    const hasHandlerBehaviors = handlerBehaviorTypes && handlerBehaviorTypes.length > 0;
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
    const filteredBeforeTypes = beforeTypes.filter((t) => !handlerBehaviorIds.has(getBehaviorId(t)));
    const filteredAfterTypes = afterTypes.filter((t) => !handlerBehaviorIds.has(getBehaviorId(t)));

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

    // ── Pre-resolve everything at bootstrap ──

    // 1. Resolve behavior instances once (singletons — no per-request DI lookups)
    const resolvedBehaviors = new Map<number, IPipelineBehavior>();
    const dynamicIndices = new Set<number>();

    for (let i = 0; i < behaviorTypes.length; i++) {
      const BehaviorClass = behaviorTypes[i];
      try {
        resolvedBehaviors.set(i, this.moduleRef.get(BehaviorClass, { strict: false }));
      } catch {
        // Fallback for request-scoped providers (rare)
        this.logger.warn(
          `${BehaviorClass.name} could not be resolved as singleton — will resolve per-request`,
        );
        dynamicIndices.add(i);
      }
    }

    // 2. Build handler metadata (kind, name, options) — computed once
    //    Merge global options with handler-specific options (handler wins on conflict)
    const handlerOptions: Map<string, Record<string, any>> | undefined =
      Reflect.getMetadata(PIPELINE_BEHAVIORS_OPTIONS_METADATA, handlerType);

    const mergedOptions = new Map<string, Record<string, any>>([
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

    const moduleRef = this.moduleRef;
    const correlationIdFactory = this.options?.correlationIdFactory;
    const correlationIdRunner = this.options?.correlationIdRunner;

    // 3. Replace method — closure captures pre-resolved behaviors and meta.
    //    For scoped handlers the prototype is patched, so every per-request
    //    instance created by the DI container inherits the pipelined method.
    target[methodName] = async function pipelinedMethod(
      this: any,
      request: any,
    ): Promise<any> {
      const context = new PipelineContext(request, meta);

      // Build per-invocation array — singleton slots reused, request-scoped freshly resolved.
      // The captured `behaviors` array is never mutated; request-scoped instances
      // are local to this invocation, preventing cross-request state leaks.
      let localBehaviors: IPipelineBehavior[];
      if (dynamicIndices.size > 0) {
        localBehaviors = await Promise.all(
          behaviorTypes.map((BehaviorClass, i) =>
            dynamicIndices.has(i)
              ? moduleRef.resolve<IPipelineBehavior>(BehaviorClass, undefined, { strict: false })
              : Promise.resolve(resolvedBehaviors.get(i)!),
          ),
        );
      } else {
        // Fast path — all singletons, no copy needed
        localBehaviors = behaviorTypes.map((_, i) => resolvedBehaviors.get(i)!);
      }

      // Eagerly resolve correlationId BEFORE any behavior runs.
      // Priority: parent context (saga) > correlationIdFactory > uuidv7()
      if (!context.correlationId) {
        context.correlationId = correlationIdFactory?.() || uuidv7();
      }

      // Lock the original value — immutable from this point forward.
      context[SET_ORIGINAL_CORRELATION_ID](context.correlationId);

      // Build chain: behavior[0] → behavior[1] → ... → originalMethod
      // Use `this` so the correct instance is called for both singletons
      // (captured instance === this) and scoped handlers (per-request instance).
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
  }

  // ── Global behavior resolution ──

  /**
   * Resolves global before/after behaviors that match the given handler kind.
   * Scope filtering is controlled by `globalBehaviors.scope` in module options
   * ('all' | 'commands' | 'queries' | 'events'). Default is 'all'.
   *
   * @returns Behavior types to prepend/append plus any inline options from tuple entries.
   */
  private resolveGlobalBehaviors(requestKind: 'command' | 'query' | 'event'): {
    beforeTypes: Type<IPipelineBehavior>[];
    afterTypes: Type<IPipelineBehavior>[];
    globalOptions: Map<string, Record<string, any>>;
  } {
    const empty = {
      beforeTypes: [] as Type<IPipelineBehavior>[],
      afterTypes: [] as Type<IPipelineBehavior>[],
      globalOptions: new Map<string, Record<string, any>>(),
    };

    const config: GlobalBehaviorsOptions | undefined = this.options?.globalBehaviors;
    if (!config) return empty;

    const scope = config.scope ?? 'all';

    // Scope filtering
    if (scope === 'commands' && requestKind !== 'command') return empty;
    if (scope === 'queries' && requestKind !== 'query') return empty;
    if (scope === 'events' && requestKind !== 'event') return empty;

    const globalOptions = new Map<string, Record<string, any>>();

    const parseEntries = (entries: PipelineBehaviorEntry[]): Type<IPipelineBehavior>[] =>
      entries.map((entry) => {
        if (Array.isArray(entry)) {
          globalOptions.set(getBehaviorId(entry[0]), entry[1]);
          return entry[0];
        }
        return entry;
      });

    const beforeTypes = parseEntries(config.before ?? []);
    const afterTypes = parseEntries(config.after ?? []);

    return { beforeTypes, afterTypes, globalOptions };
  }
}