/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  CommandBus,
  CommandHandler,
  CqrsModule,
  type ICommandHandler,
  type IQueryHandler,
  QueryHandler,
} from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { CacheBehavior } from '@nestjs-pipeline/cache';
import { CaslBehavior } from '@nestjs-pipeline/casl';
import {
  PipelineConfigurationError,
  PipelineModule,
  UsePipeline,
} from '@nestjs-pipeline/core';
import { IdempotencyBehavior } from '@nestjs-pipeline/idempotency';
import {
  RateLimitBehavior,
  RateLimitModule,
} from '@nestjs-pipeline/rate-limit';
import {
  ResilienceBehavior,
  ResilienceModule,
} from '@nestjs-pipeline/resilience';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { describe, expect, it, vi } from 'vitest';

class DummyCommand {
  constructor(readonly id: string = 'cmd-1') {}
}

class DummyQuery {
  constructor(readonly id: string = 'query-1') {}
}

const mockBehaviorInstance = {
  handle: vi.fn((_ctx: unknown, next: () => unknown) => next()),
};

describe('Pipeline Bootstrap Diagnostics', () => {
  describe('Safety ordering enforcement', () => {
    @QueryHandler(DummyQuery)
    @UsePipeline(
      [CacheBehavior, { key: () => 'cache-key' }],
      [CaslBehavior, {}],
    )
    class MisorderedQueryHandler implements IQueryHandler<DummyQuery> {
      async execute(_query: DummyQuery): Promise<string> {
        return 'executed';
      }
    }

    @CommandHandler(DummyCommand)
    @UsePipeline(
      [CacheBehavior, { key: () => 'cache-key' }],
      [CaslBehavior, {}],
    )
    class InactiveCacheCommandHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    @CommandHandler(DummyCommand)
    @UsePipeline(
      [CacheBehavior, { key: () => 'cache-key', kinds: ['command'] }],
      [CaslBehavior, {}],
    )
    class ExplicitCacheCommandHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('fails fast at app.init() when CacheBehavior precedes CaslBehavior on queries in strict mode', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
        ],
        providers: [
          { provide: CacheBehavior, useValue: mockBehaviorInstance },
          { provide: CaslBehavior, useValue: mockBehaviorInstance },
          MisorderedQueryHandler,
        ],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).rejects.toThrow(PipelineConfigurationError);
      } finally {
        await app.close();
      }
    });

    it('includes handler name, behavior name, and remediation fix in the error message', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
        ],
        providers: [
          { provide: CacheBehavior, useValue: mockBehaviorInstance },
          { provide: CaslBehavior, useValue: mockBehaviorInstance },
          MisorderedQueryHandler,
        ],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).rejects.toThrowError(
          /MisorderedQueryHandler.*CacheBehavior.*must execute after.*CaslBehavior/,
        );
      } finally {
        await app.close();
      }
    });

    it('allows CacheBehavior before CaslBehavior on commands when cache defaults to queries', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
        ],
        providers: [
          { provide: CacheBehavior, useValue: mockBehaviorInstance },
          { provide: CaslBehavior, useValue: mockBehaviorInstance },
          InactiveCacheCommandHandler,
        ],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).resolves.toBeDefined();
      } finally {
        await app.close();
      }
    });

    it('enforces CacheBehavior order on commands when explicitly configured in kinds', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
        ],
        providers: [
          { provide: CacheBehavior, useValue: mockBehaviorInstance },
          { provide: CaslBehavior, useValue: mockBehaviorInstance },
          ExplicitCacheCommandHandler,
        ],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).rejects.toThrow(PipelineConfigurationError);
      } finally {
        await app.close();
      }
    });

    @CommandHandler(DummyCommand)
    @UsePipeline(
      [IdempotencyBehavior, { keyFactory: () => 'idemp-key' }],
      [CaslBehavior, {}],
    )
    class MisorderedIdempotencyCommandHandler
      implements ICommandHandler<DummyCommand>
    {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    @QueryHandler(DummyQuery)
    @UsePipeline(
      [IdempotencyBehavior, { keyFactory: () => 'idemp-key' }],
      [CaslBehavior, {}],
    )
    class InactiveIdempotencyQueryHandler implements IQueryHandler<DummyQuery> {
      async execute(_query: DummyQuery): Promise<string> {
        return 'executed';
      }
    }

    it('fails fast when IdempotencyBehavior precedes CaslBehavior on scoped command handlers', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
        ],
        providers: [
          { provide: IdempotencyBehavior, useValue: mockBehaviorInstance },
          { provide: CaslBehavior, useValue: mockBehaviorInstance },
          MisorderedIdempotencyCommandHandler,
        ],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).rejects.toThrow(PipelineConfigurationError);
      } finally {
        await app.close();
      }
    });

    it('allows IdempotencyBehavior before CaslBehavior on queries when out of default scope', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
        ],
        providers: [
          { provide: IdempotencyBehavior, useValue: mockBehaviorInstance },
          { provide: CaslBehavior, useValue: mockBehaviorInstance },
          InactiveIdempotencyQueryHandler,
        ],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).resolves.toBeDefined();
      } finally {
        await app.close();
      }
    });
  });

  describe('Policy option validation and non-callable values', () => {
    @CommandHandler(DummyCommand)
    @UsePipeline([IdempotencyBehavior, {}])
    class MissingKeyFactoryHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('fails fast when IdempotencyBehavior is explicitly used without a keyFactory', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
        ],
        providers: [
          { provide: IdempotencyBehavior, useValue: mockBehaviorInstance },
          MissingKeyFactoryHandler,
        ],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).rejects.toThrow(PipelineConfigurationError);
      } finally {
        await app.close();
      }
    });

    @QueryHandler(DummyQuery)
    @UsePipeline([CacheBehavior, { key: 'not-a-callable-factory' as never }])
    class NonCallableCacheKeyQueryHandler implements IQueryHandler<DummyQuery> {
      async execute(_query: DummyQuery): Promise<string> {
        return 'executed';
      }
    }

    it('rejects non-callable key factory values at bootstrap', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
        ],
        providers: [
          { provide: CacheBehavior, useValue: mockBehaviorInstance },
          NonCallableCacheKeyQueryHandler,
        ],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).rejects.toThrowError(
          /CacheBehavior.*key factory must be a callable function/,
        );
      } finally {
        await app.close();
      }
    });

    it('accepts callable factory functions at bootstrap without executing them', async () => {
      const keyFactorySpy = vi.fn(() => 'key-1');

      @QueryHandler(DummyQuery)
      @UsePipeline([CacheBehavior, { key: keyFactorySpy }])
      class SpyKeyHandler implements IQueryHandler<DummyQuery> {
        async execute(_query: DummyQuery): Promise<string> {
          return 'executed';
        }
      }

      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
        ],
        providers: [
          { provide: CacheBehavior, useValue: mockBehaviorInstance },
          SpyKeyHandler,
        ],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).resolves.toBeDefined();
        // Verification that factory was not prematurely evaluated during bootstrap
        expect(keyFactorySpy).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });
  });

  describe('Addon module defaults and effective configuration', () => {
    @CommandHandler(DummyCommand)
    @UsePipeline(RateLimitBehavior)
    class BareRateLimitCommandHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('passes bootstrap and executes CQRS dispatch when RateLimitModule provides defaults', async () => {
      const limiter = new RateLimiterMemory({ points: 10, duration: 60 });

      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
          RateLimitModule.forRoot({
            limiter,
            defaults: { keyFactory: () => 'default-user' },
          }),
        ],
        providers: [BareRateLimitCommandHandler],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).resolves.toBeDefined();

        const commandBus = app.get(CommandBus);
        const result = await commandBus.execute(new DummyCommand('cmd-100'));
        expect(result).toBe('executed');
      } finally {
        await app.close();
      }
    });

    @CommandHandler(DummyCommand)
    class PlainCommandHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('fails bootstrap fast when RateLimitBehavior is global and module provides no keyFactory', async () => {
      const limiter = new RateLimiterMemory({ points: 10, duration: 60 });

      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          RateLimitModule.forRoot({ limiter }),
          PipelineModule.forRoot({
            diagnostics: 'strict',
            globalBehaviors: { scope: 'all', before: [RateLimitBehavior] },
          }),
        ],
        providers: [PlainCommandHandler],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).rejects.toThrow(PipelineConfigurationError);
      } finally {
        await app.close();
      }
    });

    @CommandHandler(DummyCommand)
    @UsePipeline(ResilienceBehavior)
    class BareResilienceCommandHandler
      implements ICommandHandler<DummyCommand>
    {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('fails bootstrap fast when ResilienceModule defaults configure unsafe retry for commands', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
          ResilienceModule.forRoot({
            retry: { maxAttempts: 2 },
          }),
        ],
        providers: [BareResilienceCommandHandler],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).rejects.toThrow(PipelineConfigurationError);
      } finally {
        await app.close();
      }
    });

    it('passes bootstrap and executes CQRS dispatch when ResilienceModule defaults are replay-safe', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
          ResilienceModule.forRoot({
            retry: { maxAttempts: 2, replaySafe: true },
            handleAllErrors: true,
          }),
        ],
        providers: [BareResilienceCommandHandler],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).resolves.toBeDefined();

        const commandBus = app.get(CommandBus);
        const result = await commandBus.execute(new DummyCommand('cmd-200'));
        expect(result).toBe('executed');
      } finally {
        await app.close();
      }
    });

    @CommandHandler(DummyCommand)
    @UsePipeline([
      ResilienceBehavior,
      { retry: { maxAttempts: 3, replaySafe: true } },
    ])
    class LocalRetryCommandHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('combines module default error classification with local replaySafe retry', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
          ResilienceModule.forRoot({
            handleAllErrors: true,
          }),
        ],
        providers: [LocalRetryCommandHandler],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).resolves.toBeDefined();

        const commandBus = app.get(CommandBus);
        const result = await commandBus.execute(new DummyCommand('cmd-300'));
        expect(result).toBe('executed');
      } finally {
        await app.close();
      }
    });
  });

  describe('Global pass-through and diagnostics modes', () => {
    @CommandHandler(DummyCommand)
    class NormalCommandHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('does not fail bootstrap when globally configured behaviors are passive on unconfigured handlers', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
            globalBehaviors: { scope: 'all', before: [ResilienceBehavior] },
          }),
        ],
        providers: [ResilienceBehavior, NormalCommandHandler],
      }).compile();

      const app = moduleRef.createNestApplication();

      await expect(app.init()).resolves.toBeDefined();
      await app.close();
    });

    @CommandHandler(DummyCommand)
    @UsePipeline([IdempotencyBehavior, {}])
    class WarnModeHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('logs warnings and does not throw when diagnostics: "warn"', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'warn',
          }),
        ],
        providers: [
          { provide: IdempotencyBehavior, useValue: mockBehaviorInstance },
          WarnModeHandler,
        ],
      }).compile();

      const app = moduleRef.createNestApplication();

      await expect(app.init()).resolves.toBeDefined();
      await app.close();
    });

    it('skips diagnostics completely when diagnostics: "off"', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'off',
          }),
        ],
        providers: [
          { provide: IdempotencyBehavior, useValue: mockBehaviorInstance },
          WarnModeHandler,
        ],
      }).compile();

      const app = moduleRef.createNestApplication();

      await expect(app.init()).resolves.toBeDefined();
      await app.close();
    });
  });
});
