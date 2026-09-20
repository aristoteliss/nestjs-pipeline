/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { CommandHandler, CqrsModule, type ICommandHandler } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { CacheBehavior } from '@nestjs-pipeline/cache';
import { CaslBehavior } from '@nestjs-pipeline/casl';
import {
  PipelineConfigurationError,
  PipelineModule,
  UsePipeline,
} from '@nestjs-pipeline/core';
import { IdempotencyBehavior } from '@nestjs-pipeline/idempotency';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';
import { describe, expect, it, vi } from 'vitest';

class DummyCommand {
  constructor(readonly id: string = 'cmd-1') {}
}

const mockBehaviorInstance = {
  handle: vi.fn((_ctx: unknown, next: () => unknown) => next()),
};

describe('Pipeline Bootstrap Diagnostics (S-15)', () => {
  describe('Safety ordering enforcement', () => {
    @CommandHandler(DummyCommand)
    @UsePipeline(
      [CacheBehavior, { key: () => 'cache-key' }],
      [CaslBehavior, {}],
    )
    class MisorderedHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('fails fast at app.init() when CacheBehavior precedes CaslBehavior in strict mode', async () => {
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
          MisorderedHandler,
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
          MisorderedHandler,
        ],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).rejects.toThrowError(
          /MisorderedHandler.*CacheBehavior.*must execute after.*CaslBehavior/,
        );
      } finally {
        await app.close();
      }
    });
  });

  describe('Policy option validation', () => {
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

    @CommandHandler(DummyCommand)
    @UsePipeline([ResilienceBehavior, { retry: { maxAttempts: 2 } }])
    class UnsafeRetryCommandHandler implements ICommandHandler<DummyCommand> {
      async execute(_command: DummyCommand): Promise<string> {
        return 'executed';
      }
    }

    it('fails fast when ResilienceBehavior retries a command without replaySafe and error classifier', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          PipelineModule.forRoot({
            diagnostics: 'strict',
          }),
        ],
        providers: [ResilienceBehavior, UnsafeRetryCommandHandler],
      }).compile();

      const app = moduleRef.createNestApplication();

      try {
        await expect(app.init()).rejects.toThrowError(
          /UnsafeRetryCommandHandler.*ResilienceBehavior.*retry.replaySafe: true/,
        );
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
