/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Logger } from '@nestjs/common';
import { ExplorerService } from '@nestjs/cqrs/dist/services/explorer.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsePipeline } from '../decorators/pipeline.decorator';
import {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface';
import { IPipelineContext } from '../interfaces/pipeline.context.interface';
import {
  IPipelineBehaviorContract,
  PIPELINE_BEHAVIOR_CONTRACT,
  PipelineBehaviorDiagnostic,
  PipelineBehaviorValidationContext,
  PipelineConfigurationError,
} from '../interfaces/pipeline-behavior-contract.interface';
import { PipelineBootstrapService } from './pipeline.bootstrap.service';

// ─────────────────────────────────────────────────────────────────
// Test Behaviors with Contracts
// ─────────────────────────────────────────────────────────────────

class AuthBehavior implements IPipelineBehavior {
  async handle(_ctx: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

class CacheBehaviorWithOrder implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    order: {
      after: [AuthBehavior],
    },
    validate: (
      ctx: PipelineBehaviorValidationContext,
    ): PipelineBehaviorDiagnostic[] | undefined => {
      if (
        (ctx.declarationSource === 'handler' ||
          ctx.declarationSource === 'both') &&
        !ctx.effectiveOptions?.key
      ) {
        return [
          {
            handlerName: ctx.handlerName,
            behaviorName: CacheBehaviorWithOrder.name,
            message: 'Explicit cache intent requires a key factory',
            fix: 'Provide key in @UsePipeline([CacheBehaviorWithOrder, { key: ... }])',
          },
        ];
      }

      return undefined;
    },
  };

  async handle(_ctx: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

class IdempotencyBehaviorWithValidation implements IPipelineBehavior {
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    order: {
      after: ['AuthBehavior'],
    },
    validate: (
      ctx: PipelineBehaviorValidationContext,
    ): PipelineBehaviorDiagnostic[] | undefined => {
      if (
        (ctx.declarationSource === 'handler' ||
          ctx.declarationSource === 'both') &&
        !ctx.effectiveOptions?.keyFactory
      ) {
        return [
          {
            handlerName: ctx.handlerName,
            behaviorName: IdempotencyBehaviorWithValidation.name,
            message:
              'Explicit idempotency intent requires a keyFactory for deduplication',
            fix: 'Provide keyFactory in @UsePipeline([IdempotencyBehaviorWithValidation, { keyFactory: ... }])',
          },
        ];
      }

      return undefined;
    },
  };

  async handle(_ctx: IPipelineContext, next: NextDelegate) {
    return next();
  }
}

// ─────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────

@UsePipeline(
  [CacheBehaviorWithOrder, { key: () => 'valid-key' }],
  AuthBehavior, // ordering violation: Cache is before Auth!
)
class MisorderedHandler {
  async execute() {
    return { ok: true };
  }
}

@UsePipeline([
  CacheBehaviorWithOrder,
  {}, // missing key
])
class MissingKeyHandler {
  async execute() {
    return { ok: true };
  }
}

@UsePipeline(
  AuthBehavior,
  [CacheBehaviorWithOrder, { key: () => 'valid-key' }], // valid order and key
)
class ValidHandler {
  async execute() {
    return { ok: true };
  }
}

class PassiveGlobalHandler {
  async execute() {
    return { ok: true };
  }
}

function makeWrapper(instance: any, metatype: any) {
  return {
    instance,
    metatype,
    scope: 0,
    isDependencyTreeStatic: () => true,
  };
}

describe('PipelineBootstrapService S-15 Diagnostics', () => {
  let moduleRefMock: any;
  let explorerServiceMock: any;
  const bootstrapped: PipelineBootstrapService[] = [];

  function bootstrap(options?: unknown): PipelineBootstrapService {
    const service = new PipelineBootstrapService(
      moduleRefMock,
      options as never,
    );
    bootstrapped.push(service);
    service.onApplicationBootstrap();
    return service;
  }

  beforeEach(() => {
    explorerServiceMock = {
      explore: vi.fn(() => ({ commands: [], queries: [], events: [] })),
    };

    moduleRefMock = {
      get: vi.fn((token: any) => {
        if (token === ExplorerService) return explorerServiceMock;
        if (token === AuthBehavior) return new AuthBehavior();
        if (token === CacheBehaviorWithOrder)
          return new CacheBehaviorWithOrder();
        if (token === IdempotencyBehaviorWithValidation)
          return new IdempotencyBehaviorWithValidation();
        return null;
      }),
    };
  });

  afterEach(() => {
    while (bootstrapped.length > 0) {
      bootstrapped.pop()?.onModuleDestroy();
    }
  });

  it('fails bootstrap with PipelineConfigurationError on ordering violations', () => {
    const instance = new MisorderedHandler();
    explorerServiceMock.explore.mockReturnValue({
      queries: [makeWrapper(instance, MisorderedHandler)],
      commands: [],
      events: [],
    });

    expect(() => bootstrap()).toThrow(PipelineConfigurationError);
    try {
      bootstrap();
    } catch (err) {
      expect(err).toBeInstanceOf(PipelineConfigurationError);
      const confErr = err as PipelineConfigurationError;
      expect(confErr.diagnostics).toHaveLength(1);
      expect(confErr.diagnostics[0].behaviorName).toBe(
        CacheBehaviorWithOrder.name,
      );
      expect(confErr.diagnostics[0].message).toContain('must execute after');
      expect(confErr.diagnostics[0].fix).toContain(
        'runs before CacheBehaviorWithOrder',
      );
      expect(confErr.message).toContain('MisorderedHandler');
    }
  });

  it('fails bootstrap with PipelineConfigurationError on invalid explicit handler options', () => {
    const instance = new MissingKeyHandler();
    explorerServiceMock.explore.mockReturnValue({
      queries: [makeWrapper(instance, MissingKeyHandler)],
      commands: [],
      events: [],
    });

    expect(() => bootstrap()).toThrow(PipelineConfigurationError);
    try {
      bootstrap();
    } catch (err) {
      expect(err).toBeInstanceOf(PipelineConfigurationError);
      const confErr = err as PipelineConfigurationError;
      expect(confErr.diagnostics[0].message).toContain(
        'Explicit cache intent requires a key factory',
      );
      expect(confErr.diagnostics[0].fix).toContain('Provide key in');
    }
  });

  it('passes bootstrap when ordering and options are valid', () => {
    const instance = new ValidHandler();
    explorerServiceMock.explore.mockReturnValue({
      queries: [makeWrapper(instance, ValidHandler)],
      commands: [],
      events: [],
    });

    expect(() => bootstrap()).not.toThrow();
  });

  it('allows passive pass-through when behavior is global and handler did not opt in', () => {
    const instance = new PassiveGlobalHandler();
    explorerServiceMock.explore.mockReturnValue({
      queries: [makeWrapper(instance, PassiveGlobalHandler)],
      commands: [],
      events: [],
    });

    // CacheBehaviorWithOrder is global without options, handler does not declare options.
    // Must NOT fail because declarationSource === 'global'.
    expect(() =>
      bootstrap({
        globalBehaviors: [
          {
            scope: 'queries',
            before: [CacheBehaviorWithOrder],
          },
        ],
      }),
    ).not.toThrow();
  });

  it('logs warnings instead of throwing when diagnostics mode is warn', () => {
    const instance = new MissingKeyHandler();
    explorerServiceMock.explore.mockReturnValue({
      queries: [makeWrapper(instance, MissingKeyHandler)],
      commands: [],
      events: [],
    });

    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    expect(() => bootstrap({ diagnostics: 'warn' })).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Pipeline Diagnostic]'),
    );
    warnSpy.mockRestore();
  });

  it('bypasses validation when diagnostics mode is off', () => {
    const instance = new MissingKeyHandler();
    explorerServiceMock.explore.mockReturnValue({
      queries: [makeWrapper(instance, MissingKeyHandler)],
      commands: [],
      events: [],
    });

    expect(() => bootstrap({ diagnostics: 'off' })).not.toThrow();
  });
});
