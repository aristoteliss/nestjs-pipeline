/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Cross-package behavior composition contracts.
 *
 * Verifies real exported behavior classes at ordering boundaries:
 * 1. DeadLetterBehavior outside ResilienceBehavior: dead-letters once after retries exhaust.
 * 2. FeatureFlagBehavior outside CacheBehavior: disabled feature flag short-circuits before cache.
 * 3. ResilienceBehavior outside IdempotencyBehavior: post-success finalization error is not retried.
 * 4. Nest TestingModule integration with real PipelineModule and @UsePipeline composition.
 */

import {
  CommandBus,
  CommandHandler,
  CqrsModule,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import {
  CacheBehavior,
  createPartitionedCacheKeyFactory,
} from '@nestjs-pipeline/cache';
import {
  type IPipelineContext,
  PipelineModule,
  type Type,
  UsePipeline,
} from '@nestjs-pipeline/core';
import {
  DeadLetterBehavior,
  DeadLetterModule,
  type DeadLetterTransport,
} from '@nestjs-pipeline/deadletter';
import {
  FeatureDisabledError,
  FeatureFlagBehavior,
} from '@nestjs-pipeline/feature-flags';
import {
  IdempotencyBehavior,
  IdempotencyCompletionError,
  MemoryIdempotencyStore,
} from '@nestjs-pipeline/idempotency';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';
import type { Client } from '@openfeature/server-sdk';
import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import { describe, expect, it, vi } from 'vitest';

class TransientTestError extends Error {}

function makeContext(
  requestKind: IPipelineContext['requestKind'],
  optionMap: Map<Type, unknown>,
): IPipelineContext {
  return {
    correlationId: 'corr-1',
    tenantId: 'tenant-a',
    request: { id: 'req-1' },
    requestType: class Request {},
    requestName: 'Request',
    handlerType: class Handler {},
    handlerName: 'Handler',
    requestKind,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn((behavior: Type) => optionMap.get(behavior)),
  } as unknown as IPipelineContext;
}

describe('Cross-package behavior composition contracts', () => {
  describe('Contract A: DeadLetterBehavior outside ResilienceBehavior', () => {
    it('dead-letters once after real resilience policy exhausts retries', async () => {
      const send = vi.fn().mockResolvedValue(undefined);
      const deadLetter = new DeadLetterBehavior({ send });
      const resilience = new ResilienceBehavior();

      const options = new Map<Type, unknown>([
        [
          DeadLetterBehavior,
          {
            captureKinds: ['event'],
            rethrow: true,
          },
        ],
        [
          ResilienceBehavior,
          {
            handle: (error: unknown) => error instanceof TransientTestError,
            retry: {
              maxAttempts: 2,
              replaySafe: true,
              backoff: { type: 'constant', delay: 0 },
            },
          },
        ],
      ]);

      const context = makeContext('event', options);
      let executions = 0;

      const handler = async (): Promise<never> => {
        executions += 1;
        throw new TransientTestError(`attempt-${executions}`);
      };

      await expect(
        deadLetter.handle(context, () => resilience.handle(context, handler)),
      ).rejects.toThrow(TransientTestError);

      expect(executions).toBe(3); // 1 initial + 2 retries
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestKind: 'event',
          error: expect.objectContaining({
            message: 'attempt-3',
          }),
        }),
      );
    });
  });

  describe('Contract B: FeatureFlagBehavior outside CacheBehavior', () => {
    it('does not return a cached value after an outer feature gate becomes disabled', async () => {
      let enabled = true;

      const client = {
        getBooleanDetails: vi.fn(async () => ({
          flagKey: 'reports-v2',
          value: enabled,
        })),
      } as unknown as Client;

      const feature = new FeatureFlagBehavior(client);
      const cache = new CacheBehavior(createCache({ stores: [new Keyv()] }));

      const key = createPartitionedCacheKeyFactory({
        principal: () => 'alice',
        requireTenant: false,
      });

      const options = new Map<Type, unknown>([
        [FeatureFlagBehavior, { flag: 'reports-v2' }],
        [CacheBehavior, { key }],
      ]);

      let handlerExecutions = 0;
      const handler = async () => {
        handlerExecutions += 1;
        return { secret: 'cached-result' };
      };

      // First request: enabled, cache is populated.
      const context1 = makeContext('query', options);
      await expect(
        feature.handle(context1, () => cache.handle(context1, handler)),
      ).resolves.toEqual({ secret: 'cached-result' });

      expect(handlerExecutions).toBe(1);

      // Second request: same cache key, but feature gate is disabled.
      enabled = false;
      const context2 = makeContext('query', options);

      await expect(
        feature.handle(context2, () => cache.handle(context2, handler)),
      ).rejects.toBeInstanceOf(FeatureDisabledError);

      // The cache must not bypass the disabled gate, and handler must not run again.
      expect(handlerExecutions).toBe(1);
    });
  });

  describe('Contract C: ResilienceBehavior outside IdempotencyBehavior', () => {
    it('does not replay a successful mutation when idempotency finalization fails', async () => {
      const memory = new MemoryIdempotencyStore({
        cleanupIntervalMs: 0,
      });

      const store = {
        get: memory.get.bind(memory),
        setIfAbsent: memory.setIfAbsent.bind(memory),
        deleteIfOwned: memory.deleteIfOwned.bind(memory),
        set: memory.set.bind(memory),
        delete: memory.delete.bind(memory),
        completeIfOwned: vi
          .fn()
          .mockRejectedValue(new Error('idempotency store unavailable')),
      };

      const idempotency = new IdempotencyBehavior(store as never);
      const resilience = new ResilienceBehavior();

      const options = new Map<Type, unknown>([
        [
          IdempotencyBehavior,
          {
            keyFactory: () => 'tenant-a:alice:create-1',
            ttl: 60_000,
          },
        ],
        [
          ResilienceBehavior,
          {
            // The classifier under test: finalization error must never replay the mutation
            handle: (error: unknown) =>
              !(error instanceof IdempotencyCompletionError),
            retry: {
              maxAttempts: 2,
              replaySafe: true,
              backoff: { type: 'constant', delay: 0 },
            },
          },
        ],
      ]);

      const context = makeContext('command', options);
      let businessExecutions = 0;

      const businessHandler = async () => {
        businessExecutions += 1;
        return { created: true };
      };

      await expect(
        resilience.handle(context, () =>
          idempotency.handle(context, businessHandler),
        ),
      ).rejects.toMatchObject({
        name: 'IdempotencyCompletionError',
        executionSucceeded: true,
        phase: 'store',
      });

      expect(businessExecutions).toBe(1);
      expect(store.completeIfOwned).toHaveBeenCalledTimes(1);

      memory.destroy();
    });
  });

  describe('Contract D: Nest TestingModule composition with real PipelineModule', () => {
    class FailingRetriedCommand {
      constructor(readonly id: string) {}
    }

    let handlerCalls = 0;
    const mockTransportSend = vi.fn().mockResolvedValue(undefined);

    @CommandHandler(FailingRetriedCommand)
    @UsePipeline(
      [
        DeadLetterBehavior,
        {
          captureKinds: ['command'],
          rethrow: true,
        },
      ],
      [
        ResilienceBehavior,
        {
          handle: (err: unknown) => err instanceof TransientTestError,
          retry: {
            maxAttempts: 2,
            replaySafe: true,
            backoff: { type: 'constant', delay: 0 },
          },
        },
      ],
    )
    class FailingRetriedHandler
      implements ICommandHandler<FailingRetriedCommand>
    {
      async execute(command: FailingRetriedCommand): Promise<string> {
        handlerCalls += 1;
        throw new TransientTestError(`failure-${handlerCalls}-${command.id}`);
      }
    }

    it('orchestrates DeadLetter -> Resilience in Nest CQRS command pipeline', async () => {
      handlerCalls = 0;
      mockTransportSend.mockClear();

      const deadLetterTransport: DeadLetterTransport = {
        send: mockTransportSend,
      };

      const moduleRef = await Test.createTestingModule({
        imports: [
          CqrsModule.forRoot(),
          DeadLetterModule.forRoot({ transport: deadLetterTransport }),
          PipelineModule.forRoot({
            behaviors: [DeadLetterBehavior, ResilienceBehavior],
          }),
        ],
        providers: [FailingRetriedHandler, ResilienceBehavior],
      }).compile();

      const app = moduleRef.createNestApplication();
      await app.init();

      const bus = app.get(CommandBus);

      await expect(
        bus.execute(new FailingRetriedCommand('cmd-42')),
      ).rejects.toThrow(TransientTestError);

      // Handler called 1 initial + 2 retries = 3
      expect(handlerCalls).toBe(3);

      // Dead-letter transport captured exactly once after retry exhaustion
      expect(mockTransportSend).toHaveBeenCalledTimes(1);
      expect(mockTransportSend).toHaveBeenCalledWith(
        expect.objectContaining({
          requestName: 'FailingRetriedCommand',
          requestKind: 'command',
          error: expect.objectContaining({
            message: 'failure-3-cmd-42',
          }),
        }),
      );

      await app.close();
    });
  });
});
