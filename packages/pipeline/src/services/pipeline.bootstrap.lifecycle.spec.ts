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

import { ExplorerService } from '@nestjs/cqrs/dist/services/explorer.service';
import { describe, expect, it, vi } from 'vitest';
import type {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import type { IPipelineContext } from '../interfaces/pipeline.context.interface';
import { PipelineBootstrapService } from './pipeline.bootstrap.service';
import { untyped } from '../types/safe-typing';

class LifecycleCommand {
  constructor(public readonly value: string) {}
}

class BehaviorA implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate) {
    context.items.set('behavior', 'BehaviorA');
    return next();
  }
}

class BehaviorB implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate) {
    context.items.set('behavior', 'BehaviorB');
    return next();
  }
}

class ScopedLifecycleHandler {
  async execute(command: LifecycleCommand) {
    return { ok: true, value: command.value };
  }
}

class SingletonLifecycleHandler {
  async execute(command: LifecycleCommand) {
    return { ok: true, value: command.value };
  }
}

function makeScopedWrapper(handlerType: any) {
  const values = new Map<any, any>();
  const wrapper: any = {
    metatype: handlerType,
    scope: 2,
    values,
    isDependencyTreeStatic: vi.fn(() => false),
    getInstanceByContextId: vi.fn(function (contextId: any) {
      return values.get(contextId);
    }),
    setInstanceByContextId: vi.fn(function (contextId: any, value: any) {
      values.set(contextId, value);
    }),
  };
  return wrapper;
}

function makeSingletonWrapper(instance: any, handlerType: any) {
  return {
    instance,
    metatype: handlerType,
    scope: 0,
    isDependencyTreeStatic: vi.fn(() => true),
  };
}

describe('PipelineBootstrapService Lifecycle & OnModuleDestroy', () => {
  it('restores prototype and avoids stale closures across sequential application lifecycles', async () => {
    const originalProtoExecute = ScopedLifecycleHandler.prototype.execute;

    // --- App 1 Boot ---
    const wrapper1 = makeScopedWrapper(ScopedLifecycleHandler);
    const explorer1 = {
      explore: () => ({ commands: [wrapper1], queries: [], events: [] }),
    };
    const moduleRef1 = {
      get: vi.fn((token: any) => {
        if (token === ExplorerService) return explorer1;
        if (token === BehaviorA) return new BehaviorA();
        throw new Error(`Unexpected token ${token}`);
      }),
      resolve: vi.fn(),
    };

    const app1Bootstrap = new PipelineBootstrapService(moduleRef1 as never, {
      globalBehaviors: { before: [BehaviorA] },
    });
    app1Bootstrap.onApplicationBootstrap();

    expect(untyped(ScopedLifecycleHandler.prototype.execute).__pipelined).toBe(
      true,
    );

    // App 1 instance execution
    const instance1 = new ScopedLifecycleHandler();
    wrapper1.setInstanceByContextId('ctx-1', { instance: instance1 });
    const result1: any = await instance1.execute(new LifecycleCommand('test-1'));
    expect(result1.ok).toBe(true);

    // --- App 1 Destroy ---
    app1Bootstrap.onModuleDestroy();

    // Prototype must be restored to the pristine original method
    expect(ScopedLifecycleHandler.prototype.execute).toBe(originalProtoExecute);
    expect(
      untyped(ScopedLifecycleHandler.prototype.execute).__pipelined,
    ).toBeUndefined();

    // --- App 2 Boot with BehaviorB ---
    const wrapper2 = makeScopedWrapper(ScopedLifecycleHandler);
    const explorer2 = {
      explore: () => ({ commands: [wrapper2], queries: [], events: [] }),
    };
    const moduleRef2 = {
      get: vi.fn((token: any) => {
        if (token === ExplorerService) return explorer2;
        if (token === BehaviorB) return new BehaviorB();
        throw new Error(`Unexpected token ${token}`);
      }),
      resolve: vi.fn(),
    };

    const app2Bootstrap = new PipelineBootstrapService(moduleRef2 as never, {
      globalBehaviors: { before: [BehaviorB] },
    });
    app2Bootstrap.onApplicationBootstrap();

    expect(untyped(ScopedLifecycleHandler.prototype.execute).__pipelined).toBe(
      true,
    );

    // App 2 instance execution should use BehaviorB and moduleRef2
    const instance2 = new ScopedLifecycleHandler();
    wrapper2.setInstanceByContextId('ctx-2', { instance: instance2 });
    const result2: any = await instance2.execute(new LifecycleCommand('test-2'));
    expect(result2.ok).toBe(true);

    // moduleRef1 must NOT have been called by App 2
    expect(moduleRef1.get).not.toHaveBeenCalledWith(BehaviorB);

    // --- App 2 Destroy ---
    app2Bootstrap.onModuleDestroy();
    expect(ScopedLifecycleHandler.prototype.execute).toBe(originalProtoExecute);
    expect(
      untyped(ScopedLifecycleHandler.prototype.execute).__pipelined,
    ).toBeUndefined();
  });

  it('correctly dispatches concurrent applications with scoped handlers and unregisters cleanly', async () => {
    const originalProtoExecute = ScopedLifecycleHandler.prototype.execute;

    // --- App 1 ---
    const wrapper1 = makeScopedWrapper(ScopedLifecycleHandler);
    const explorer1 = {
      explore: () => ({ commands: [wrapper1], queries: [], events: [] }),
    };
    let behaviorAExecuted = false;
    class CustomBehaviorA implements IPipelineBehavior {
      async handle(_ctx: IPipelineContext, next: NextDelegate) {
        behaviorAExecuted = true;
        return next();
      }
    }
    const moduleRef1 = {
      get: vi.fn((token: any) => {
        if (token === ExplorerService) return explorer1;
        if (token === CustomBehaviorA) return new CustomBehaviorA();
        throw new Error(`Unexpected token ${token}`);
      }),
      resolve: vi.fn(),
    };
    const app1 = new PipelineBootstrapService(moduleRef1 as never, {
      globalBehaviors: { before: [CustomBehaviorA] },
    });
    app1.onApplicationBootstrap();

    // --- App 2 Concurrent ---
    const wrapper2 = makeScopedWrapper(ScopedLifecycleHandler);
    const explorer2 = {
      explore: () => ({ commands: [wrapper2], queries: [], events: [] }),
    };
    let behaviorBExecuted = false;
    class CustomBehaviorB implements IPipelineBehavior {
      async handle(_ctx: IPipelineContext, next: NextDelegate) {
        behaviorBExecuted = true;
        return next();
      }
    }
    const moduleRef2 = {
      get: vi.fn((token: any) => {
        if (token === ExplorerService) return explorer2;
        if (token === CustomBehaviorB) return new CustomBehaviorB();
        throw new Error(`Unexpected token ${token}`);
      }),
      resolve: vi.fn(),
    };
    const app2 = new PipelineBootstrapService(moduleRef2 as never, {
      globalBehaviors: { before: [CustomBehaviorB] },
    });
    app2.onApplicationBootstrap();

    // Instantiate for App 1
    const inst1 = new ScopedLifecycleHandler();
    wrapper1.setInstanceByContextId('ctx-1', { instance: inst1 });

    // Instantiate for App 2
    const inst2 = new ScopedLifecycleHandler();
    wrapper2.setInstanceByContextId('ctx-2', { instance: inst2 });

    // Execute inst1 -> should run CustomBehaviorA
    behaviorAExecuted = false;
    behaviorBExecuted = false;
    await inst1.execute(new LifecycleCommand('one'));
    expect(behaviorAExecuted).toBe(true);
    expect(behaviorBExecuted).toBe(false);

    // Execute inst2 -> should run CustomBehaviorB
    behaviorAExecuted = false;
    behaviorBExecuted = false;
    await inst2.execute(new LifecycleCommand('two'));
    expect(behaviorAExecuted).toBe(false);
    expect(behaviorBExecuted).toBe(true);

    // Destroy App 1
    app1.onModuleDestroy();

    // App 2 instance should STILL run CustomBehaviorB
    behaviorAExecuted = false;
    behaviorBExecuted = false;
    await inst2.execute(new LifecycleCommand('three'));
    expect(behaviorAExecuted).toBe(false);
    expect(behaviorBExecuted).toBe(true);

    // Destroy App 2
    app2.onModuleDestroy();

    // Prototype is completely restored
    expect(ScopedLifecycleHandler.prototype.execute).toBe(originalProtoExecute);
    expect(
      untyped(ScopedLifecycleHandler.prototype.execute).__pipelined,
    ).toBeUndefined();
  });

  it('restores singleton methods on onModuleDestroy', async () => {
    const singleton = new SingletonLifecycleHandler();
    const originalExecute = singleton.execute;

    const wrapper = makeSingletonWrapper(singleton, SingletonLifecycleHandler);
    const explorer = {
      explore: () => ({ commands: [wrapper], queries: [], events: [] }),
    };
    const moduleRef = {
      get: vi.fn((token: any) => {
        if (token === ExplorerService) return explorer;
        if (token === BehaviorA) return new BehaviorA();
        throw new Error(`Unexpected token ${token}`);
      }),
      resolve: vi.fn(),
    };

    const bootstrap = new PipelineBootstrapService(moduleRef as never, {
      globalBehaviors: { before: [BehaviorA] },
    });
    bootstrap.onApplicationBootstrap();

    expect(untyped(singleton.execute).__pipelined).toBe(true);
    expect(singleton.execute).not.toBe(originalExecute);

    bootstrap.onModuleDestroy();

    expect(singleton.execute).toBe(originalExecute);
    expect(untyped(singleton.execute).__pipelined).toBeUndefined();
  });
});
