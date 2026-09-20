/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Logger } from '@nestjs/common';
import { ExplorerService } from '@nestjs/cqrs/dist/services/explorer.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PIPELINE_BEHAVIOR_ID,
  UsePipeline,
} from '../decorators/pipeline.decorator';
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

describe('PipelineBootstrapService Diagnostics', () => {
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

    let confErr: PipelineConfigurationError | undefined;
    try {
      bootstrap();
    } catch (err) {
      if (err instanceof PipelineConfigurationError) {
        confErr = err;
      }
    }

    expect(confErr).toBeDefined();
    expect(confErr?.diagnostics).toHaveLength(1);
    expect(confErr?.diagnostics[0].behaviorName).toBe(
      CacheBehaviorWithOrder.name,
    );
    expect(confErr?.diagnostics[0].message).toContain('must execute after');
    expect(confErr?.diagnostics[0].fix).toContain(
      'runs before CacheBehaviorWithOrder',
    );
    expect(confErr?.message).toContain('MisorderedHandler');
  });

  it('fails bootstrap with PipelineConfigurationError on invalid explicit handler options', () => {
    const instance = new MissingKeyHandler();
    explorerServiceMock.explore.mockReturnValue({
      queries: [makeWrapper(instance, MissingKeyHandler)],
      commands: [],
      events: [],
    });

    let confErr: PipelineConfigurationError | undefined;
    try {
      bootstrap();
    } catch (err) {
      if (err instanceof PipelineConfigurationError) {
        confErr = err;
      }
    }

    expect(confErr).toBeDefined();
    expect(confErr?.diagnostics[0].message).toContain(
      'Explicit cache intent requires a key factory',
    );
    expect(confErr?.diagnostics[0].fix).toContain('Provide key in');
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

  it('evaluates dynamic context-aware ordering rules', () => {
    class DynamicOrderedBehavior implements IPipelineBehavior {
      static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract =
        {
          order: (ctx: PipelineBehaviorValidationContext) => {
            if (ctx.requestKind === 'query') {
              return { after: [AuthBehavior] };
            }
            return undefined;
          },
        };

      async handle(_ctx: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }

    @UsePipeline(DynamicOrderedBehavior, AuthBehavior)
    class DynamicCommandHandler {
      async execute() {
        return { ok: true };
      }
    }

    @UsePipeline(DynamicOrderedBehavior, AuthBehavior)
    class DynamicQueryHandler {
      async execute() {
        return { ok: true };
      }
    }

    moduleRefMock.get.mockImplementation((token: any) => {
      if (token === ExplorerService) return explorerServiceMock;
      if (token === AuthBehavior) return new AuthBehavior();
      if (token === DynamicOrderedBehavior) return new DynamicOrderedBehavior();
      return null;
    });

    // When handler is a command, DynamicOrderedBehavior is inactive for ordering -> passes
    explorerServiceMock.explore.mockReturnValue({
      commands: [
        makeWrapper(new DynamicCommandHandler(), DynamicCommandHandler),
      ],
      queries: [],
      events: [],
    });
    expect(() => bootstrap()).not.toThrow();

    // When handler is a query, DynamicOrderedBehavior requires order after AuthBehavior -> fails
    explorerServiceMock.explore.mockReturnValue({
      queries: [makeWrapper(new DynamicQueryHandler(), DynamicQueryHandler)],
      commands: [],
      events: [],
    });
    expect(() => bootstrap()).toThrow(PipelineConfigurationError);
  });

  it('matches behavior identities using PIPELINE_BEHAVIOR_ID and avoids same-named false positives', () => {
    const AUTH_ID = 'security:auth';

    class RealAuthBehavior implements IPipelineBehavior {
      static readonly [PIPELINE_BEHAVIOR_ID] = AUTH_ID;
      async handle(_ctx: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }

    class SameNamedAuthBehavior implements IPipelineBehavior {
      static readonly [PIPELINE_BEHAVIOR_ID] = 'unrelated:auth';
      async handle(_ctx: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }

    class SecuredBehavior implements IPipelineBehavior {
      static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract =
        {
          order: {
            after: [AUTH_ID],
          },
        };
      async handle(_ctx: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }

    @UsePipeline(SecuredBehavior, SameNamedAuthBehavior)
    class SameNameHandler {
      async execute() {
        return { ok: true };
      }
    }

    moduleRefMock.get.mockImplementation((token: any) => {
      if (token === ExplorerService) return explorerServiceMock;
      if (token === RealAuthBehavior) return new RealAuthBehavior();
      if (token === SameNamedAuthBehavior) return new SameNamedAuthBehavior();
      if (token === SecuredBehavior) return new SecuredBehavior();
      return null;
    });

    // SameNamedAuthBehavior does not have AUTH_ID, so edge is not matched -> passes
    explorerServiceMock.explore.mockReturnValue({
      queries: [makeWrapper(new SameNameHandler(), SameNameHandler)],
      commands: [],
      events: [],
    });
    expect(() => bootstrap()).not.toThrow();

    @UsePipeline(SecuredBehavior, RealAuthBehavior)
    class RealAuthHandler {
      async execute() {
        return { ok: true };
      }
    }

    // RealAuthBehavior matches AUTH_ID -> fails ordering
    explorerServiceMock.explore.mockReturnValue({
      queries: [makeWrapper(new RealAuthHandler(), RealAuthHandler)],
      commands: [],
      events: [],
    });
    expect(() => bootstrap()).toThrow(PipelineConfigurationError);
  });

  it('enforces order.before constraints when behavior is positioned after target', () => {
    class PreLoggingBehavior implements IPipelineBehavior {
      static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract =
        {
          order: {
            before: [AuthBehavior],
          },
        };
      async handle(_ctx: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }

    @UsePipeline(AuthBehavior, PreLoggingBehavior)
    class InvertedHandler {
      async execute() {
        return { ok: true };
      }
    }

    moduleRefMock.get.mockImplementation((token: any) => {
      if (token === ExplorerService) return explorerServiceMock;
      if (token === AuthBehavior) return new AuthBehavior();
      if (token === PreLoggingBehavior) return new PreLoggingBehavior();
      return null;
    });

    explorerServiceMock.explore.mockReturnValue({
      queries: [makeWrapper(new InvertedHandler(), InvertedHandler)],
      commands: [],
      events: [],
    });

    let confErr: PipelineConfigurationError | undefined;
    try {
      bootstrap();
    } catch (err) {
      if (err instanceof PipelineConfigurationError) {
        confErr = err;
      }
    }

    expect(confErr).toBeDefined();
    expect(confErr?.diagnostics[0].message).toContain('must execute before it');
  });

  it('resolves effective options via instance resolveEffectiveOptions', () => {
    class ConfigurableBehavior implements IPipelineBehavior {
      static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract =
        {
          validate: (ctx: PipelineBehaviorValidationContext) => {
            if (!ctx.effectiveOptions?.requiredKey) {
              return [
                {
                  handlerName: ctx.handlerName,
                  behaviorName: ConfigurableBehavior.name,
                  message: 'Missing requiredKey',
                  fix: 'Provide requiredKey',
                },
              ];
            }
            return undefined;
          },
        };

      resolveEffectiveOptions(raw?: Record<string, unknown>) {
        return { requiredKey: 'from-instance-default', ...raw };
      }

      async handle(_ctx: IPipelineContext, next: NextDelegate) {
        return next();
      }
    }

    @UsePipeline(ConfigurableBehavior)
    class BareHandler {
      async execute() {
        return { ok: true };
      }
    }

    moduleRefMock.get.mockImplementation((token: any) => {
      if (token === ExplorerService) return explorerServiceMock;
      if (token === ConfigurableBehavior) return new ConfigurableBehavior();
      return null;
    });

    explorerServiceMock.explore.mockReturnValue({
      queries: [makeWrapper(new BareHandler(), BareHandler)],
      commands: [],
      events: [],
    });

    // Handler has no local options, but instance resolveEffectiveOptions supplies requiredKey -> passes
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
