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

import { NotFoundException } from '@nestjs/common';
import {
  AuditBehavior,
  type AuditRecord,
  type AuditSink,
} from '@nestjs-pipeline/audit';
import { CacheBehavior } from '@nestjs-pipeline/cache';
import {
  assertEntityPermission,
  buildAbilityFromRules,
} from '@nestjs-pipeline/casl';
import { type IPipelineContext, LoggingBehavior } from '@nestjs-pipeline/core';
import {
  DeadLetterBehavior,
  type DeadLetterTransport,
} from '@nestjs-pipeline/deadletter';
import {
  FeatureDisabledError,
  FeatureFlagBehavior,
} from '@nestjs-pipeline/feature-flags';
import {
  IdempotencyBehavior,
  MemoryIdempotencyStore,
} from '@nestjs-pipeline/idempotency';
import { MetricsBehavior, TraceBehavior } from '@nestjs-pipeline/opentelemetry';
import {
  RateLimitBehavior,
  RateLimitExceededError,
} from '@nestjs-pipeline/rate-limit';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';
import {
  ZodValidationBehavior,
  ZodValidationError,
} from '@nestjs-pipeline/zod';
import { InMemoryProvider, OpenFeature } from '@openfeature/server-sdk';
import { metrics, trace } from '@opentelemetry/api';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { UniqueRoleNameException } from '../src/roles/domain/models/errors/role-name.exception';

// ─── Pipeline Context Helper ──────────────────────────────────────────────────

function createContext(options: {
  request?: unknown;
  requestKind?: 'command' | 'query' | 'event';
  requestName?: string;
  handlerName?: string;
  handlerType?: any;
  behaviorOptions?: Map<any, any>;
}): IPipelineContext {
  const behaviorOptionsMap = options.behaviorOptions ?? new Map();
  const itemsMap = new Map();

  return {
    correlationId: 'test-correlation-id',
    originalCorrelationId: 'test-correlation-id',
    request: options.request ?? {},
    requestType: class MockRequest {},
    requestName: options.requestName ?? 'MockCommand',
    handlerType: options.handlerType ?? class MockHandler {},
    handlerName: options.handlerName ?? 'MockHandler',
    requestKind: options.requestKind ?? 'command',
    startedAt: new Date(),
    response: undefined,
    items: itemsMap,
    getBehaviorOptions: (behavior: any) => behaviorOptionsMap.get(behavior),
  } as unknown as IPipelineContext;
}

describe('Users API Pipeline Behaviors Specification', () => {
  // ─── 1. MetricsBehavior ───────────────────────────────────────────────────
  describe('MetricsBehavior (@nestjs-pipeline/opentelemetry)', () => {
    it('records duration histogram and invocation counter for handler executions', async () => {
      const mockDuration = { record: vi.fn() };
      const mockInvocations = { add: vi.fn() };
      const mockMeter = {
        createHistogram: vi.fn().mockReturnValue(mockDuration),
        createCounter: vi.fn().mockReturnValue(mockInvocations),
      };

      vi.spyOn(metrics, 'getMeter').mockReturnValue(mockMeter as any);

      const metricsBehavior = new MetricsBehavior();
      const behaviorOptions = new Map();
      behaviorOptions.set(MetricsBehavior, { meterName: 'users-api.auth' });

      const ctx = createContext({
        requestName: 'CreateAuthCommand',
        handlerName: 'CreateAuthHandler',
        requestKind: 'command',
        behaviorOptions,
      });

      const next = vi.fn().mockResolvedValue({ token: 'jwt-123' });
      const result = await metricsBehavior.handle(ctx, next);

      expect(result).toEqual({ token: 'jwt-123' });
      expect(metrics.getMeter).toHaveBeenCalledWith('users-api.auth');
      expect(mockDuration.record).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({
          'pipeline.request.kind': 'command',
          'pipeline.request.name': 'CreateAuthCommand',
          'pipeline.handler.name': 'CreateAuthHandler',
          outcome: 'success',
        }),
      );
      expect(mockInvocations.add).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          outcome: 'success',
        }),
      );
    });

    it('records outcome=failure with error.type on failure', async () => {
      const mockDuration = { record: vi.fn() };
      const mockInvocations = { add: vi.fn() };
      const mockMeter = {
        createHistogram: vi.fn().mockReturnValue(mockDuration),
        createCounter: vi.fn().mockReturnValue(mockInvocations),
      };

      vi.spyOn(metrics, 'getMeter').mockReturnValue(mockMeter as any);

      const metricsBehavior = new MetricsBehavior();
      const ctx = createContext({
        requestName: 'CreateAuthCommand',
        handlerName: 'CreateAuthHandler',
        requestKind: 'command',
      });

      const failure = new Error('Invalid credentials');
      failure.name = 'UnauthorizedException';
      const next = vi.fn().mockRejectedValue(failure);

      await expect(metricsBehavior.handle(ctx, next)).rejects.toThrow(
        'Invalid credentials',
      );

      expect(mockInvocations.add).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          outcome: 'failure',
          'error.type': 'UnauthorizedException',
        }),
      );
    });
  });

  // ─── 2. RateLimitBehavior ─────────────────────────────────────────────────
  describe('RateLimitBehavior (@nestjs-pipeline/rate-limit)', () => {
    it('throttles login attempts when rate limit points are exceeded', async () => {
      const limiter = new RateLimiterMemory({ points: 2, duration: 60 });
      const rateLimitBehavior = new RateLimitBehavior(limiter);

      const behaviorOptions = new Map();
      behaviorOptions.set(RateLimitBehavior, {
        keyFactory: (ctx: IPipelineContext) =>
          `auth:login:${(ctx.request as any).email}`,
      });

      const ctx = createContext({
        request: { email: 'user@example.com', code: '123456' },
        requestName: 'CreateAuthCommand',
        behaviorOptions,
      });

      const next = vi.fn().mockResolvedValue({ token: 'abc' });

      // 1st request -> ok
      await rateLimitBehavior.handle(ctx, next);
      // 2nd request -> ok
      await rateLimitBehavior.handle(ctx, next);

      // 3rd request -> rate limit exceeded (429)
      await expect(rateLimitBehavior.handle(ctx, next)).rejects.toThrow(
        RateLimitExceededError,
      );
    });

    it('isolates rate limit buckets across different keys', async () => {
      const limiter = new RateLimiterMemory({ points: 1, duration: 60 });
      const rateLimitBehavior = new RateLimitBehavior(limiter);

      const behaviorOptions = new Map();
      behaviorOptions.set(RateLimitBehavior, {
        keyFactory: (ctx: IPipelineContext) =>
          `auth:login:${(ctx.request as any).email}`,
      });

      const ctxUserA = createContext({
        request: { email: 'alice@example.com' },
        behaviorOptions,
      });
      const ctxUserB = createContext({
        request: { email: 'bob@example.com' },
        behaviorOptions,
      });

      const next = vi.fn().mockResolvedValue({ token: 'abc' });

      // Alice consumes her 1 point -> ok
      await rateLimitBehavior.handle(ctxUserA, next);
      // Alice tries again -> throttled
      await expect(rateLimitBehavior.handle(ctxUserA, next)).rejects.toThrow(
        RateLimitExceededError,
      );

      // Bob tries -> not throttled because different key
      const bobRes = await rateLimitBehavior.handle(ctxUserB, next);
      expect(bobRes).toEqual({ token: 'abc' });
    });
  });

  // ─── 3. AuditBehavior ─────────────────────────────────────────────────────
  describe('AuditBehavior (@nestjs-pipeline/audit)', () => {
    it('records audit trail for role deletion with actor metadata', async () => {
      const records: AuditRecord[] = [];
      const mockSink: AuditSink = {
        write: vi.fn((record: AuditRecord) => {
          records.push(record);
        }),
      };

      const auditBehavior = new AuditBehavior(mockSink);
      const behaviorOptions = new Map();
      behaviorOptions.set(AuditBehavior, {
        action: 'role.delete',
        severity: 'high',
        actor: () => ({ id: 'admin-1', email: 'admin@acme.test' }),
      });

      const ctx = createContext({
        request: { id: 'role-uuid-1' },
        requestName: 'DeleteRoleCommand',
        handlerName: 'DeleteRoleHandler',
        behaviorOptions,
      });

      const next = vi.fn().mockResolvedValue({ success: true });
      await auditBehavior.handle(ctx, next);

      expect(mockSink.write).toHaveBeenCalledTimes(1);
      expect(records[0]).toMatchObject({
        action: 'role.delete',
        severity: 'high',
        actor: { id: 'admin-1', email: 'admin@acme.test' },
        outcome: 'success',
      });
    });

    it('records audit trail with outcome=failure when handler throws', async () => {
      const records: AuditRecord[] = [];
      const mockSink: AuditSink = {
        write: vi.fn((record: AuditRecord) => {
          records.push(record);
        }),
      };

      const auditBehavior = new AuditBehavior(mockSink);
      const behaviorOptions = new Map();
      behaviorOptions.set(AuditBehavior, {
        action: 'auth.login',
        severity: 'medium',
        actor: (ctx: IPipelineContext) => ({
          id: (ctx.request as any).email,
        }),
      });

      const ctx = createContext({
        request: { email: 'bad@example.com' },
        requestName: 'CreateAuthCommand',
        behaviorOptions,
      });

      const next = vi.fn().mockRejectedValue(new Error('Invalid password'));

      await expect(auditBehavior.handle(ctx, next)).rejects.toThrow(
        'Invalid password',
      );

      expect(mockSink.write).toHaveBeenCalledTimes(1);
      expect(records[0]).toMatchObject({
        action: 'auth.login',
        severity: 'medium',
        outcome: 'failure',
        error: expect.objectContaining({ message: 'Invalid password' }),
      });
    });
  });

  // ─── 4. IdempotencyBehavior ───────────────────────────────────────────────
  describe('IdempotencyBehavior (@nestjs-pipeline/idempotency)', () => {
    it('replays cached response for duplicate role creation requests', async () => {
      const memoryStore = new MemoryIdempotencyStore();
      const idempotencyBehavior = new IdempotencyBehavior(memoryStore);
      const behaviorOptions = new Map();
      behaviorOptions.set(IdempotencyBehavior, {
        keyFactory: (ctx: IPipelineContext) =>
          `role.create:${(ctx.request as any).name}`,
      });

      const ctx = createContext({
        request: { name: 'admin-role' },
        requestName: 'CreateRoleCommand',
        behaviorOptions,
      });

      const outcome = { id: 'role-1', name: 'admin-role' };
      const next = vi.fn().mockResolvedValue(outcome);

      // First call executes handler
      const res1 = await idempotencyBehavior.handle(ctx, next);
      expect(res1).toEqual(outcome);
      expect(next).toHaveBeenCalledTimes(1);

      // Duplicate call returns cached outcome without executing handler again
      const res2 = await idempotencyBehavior.handle(ctx, next);
      expect(res2).toEqual(outcome);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 5. FeatureFlagBehavior ───────────────────────────────────────────────
  describe('FeatureFlagBehavior (@nestjs-pipeline/feature-flags)', () => {
    it('allows execution when feature flag is enabled and blocks with FeatureDisabledError when disabled', async () => {
      const provider = new InMemoryProvider({
        'role-creation': {
          disabled: false,
          variants: { on: true, off: false },
          defaultVariant: 'on',
        },
      });
      await OpenFeature.setProviderAndWait('test-client', provider);
      const client = OpenFeature.getClient('test-client');

      const flagBehavior = new FeatureFlagBehavior(client);
      const behaviorOptions = new Map();
      behaviorOptions.set(FeatureFlagBehavior, { flag: 'role-creation' });

      const ctx = createContext({
        requestName: 'CreateRoleCommand',
        behaviorOptions,
      });

      const next = vi.fn().mockResolvedValue({ id: 'r1' });

      // Enabled -> executes
      const res = await flagBehavior.handle(ctx, next);
      expect(res).toEqual({ id: 'r1' });
      expect(next).toHaveBeenCalledTimes(1);

      // Disable the flag
      await provider.putConfiguration({
        'role-creation': {
          disabled: false,
          variants: { on: true, off: false },
          defaultVariant: 'off',
        },
      });

      // Disabled -> throws FeatureDisabledError
      await expect(flagBehavior.handle(ctx, next)).rejects.toThrow(
        FeatureDisabledError,
      );
    });
  });

  // ─── 6. CacheBehavior ─────────────────────────────────────────────────────
  describe('CacheBehavior (@nestjs-pipeline/cache)', () => {
    it('caches query responses and bypasses handler on second query execution', async () => {
      const cacheStore = new Map<string, unknown>();
      const mockCache = {
        get: vi.fn(async (k: string) => cacheStore.get(k)),
        set: vi.fn(async (k: string, v: unknown) => {
          cacheStore.set(k, v);
        }),
      };

      const cacheBehavior = new CacheBehavior(mockCache as any);
      const behaviorOptions = new Map();
      behaviorOptions.set(CacheBehavior, {
        ttl: 60_000,
        key: (_ctx: IPipelineContext) => `tenant:GetRolesQuery`,
      });

      const ctx = createContext({
        requestKind: 'query',
        requestName: 'GetRolesQuery',
        behaviorOptions,
      });

      const roles = [
        { id: '1', name: 'admin' },
        { id: '2', name: 'editor' },
      ];
      const next = vi.fn().mockResolvedValue(roles);

      // First query -> calls next() and sets cache
      const res1 = await cacheBehavior.handle(ctx, next);
      expect(res1).toEqual(roles);
      expect(next).toHaveBeenCalledTimes(1);

      // Second query -> returns from cache, next() is not called
      const res2 = await cacheBehavior.handle(ctx, next);
      expect(res2).toEqual(roles);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('does not cache null or undefined query responses', async () => {
      const mockCache = {
        get: vi.fn().mockResolvedValue(undefined),
        set: vi.fn(),
      };

      const cacheBehavior = new CacheBehavior(mockCache as any);
      const behaviorOptions = new Map();
      behaviorOptions.set(CacheBehavior, {
        ttl: 60_000,
        key: () => `tenant:GetRoleQuery:missing`,
      });

      const ctx = createContext({
        requestKind: 'query',
        requestName: 'GetRoleQuery',
        behaviorOptions,
      });

      const next = vi.fn().mockResolvedValue(null);
      const res = await cacheBehavior.handle(ctx, next);

      expect(res).toBeNull();
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  // ─── 7. ResilienceBehavior ────────────────────────────────────────────────
  describe('ResilienceBehavior (@nestjs-pipeline/resilience)', () => {
    it('retries transient failures and succeeds on subsequent attempts', async () => {
      const resilienceBehavior = new ResilienceBehavior();
      const handlerClass = class TestDeleteRoleHandler {};

      const behaviorOptions = new Map();
      behaviorOptions.set(ResilienceBehavior, {
        handle: (err: unknown) => !(err instanceof NotFoundException),
        timeout: { duration: 3_000 },
        retry: { maxAttempts: 3, backoff: { type: 'fixed', delay: 10 } },
      });

      const ctx = createContext({
        handlerType: handlerClass,
        requestName: 'DeleteRoleCommand',
        behaviorOptions,
      });

      let attempts = 0;
      const next = vi.fn(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Transient DB timeout');
        }
        return { deleted: true };
      });

      const result = await resilienceBehavior.handle(ctx, next);
      expect(result).toEqual({ deleted: true });
      expect(attempts).toBe(2);
    });

    it('does not retry non-transient domain errors like NotFoundException', async () => {
      const resilienceBehavior = new ResilienceBehavior();
      const handlerClass = class TestNotFoundHandler {};

      const behaviorOptions = new Map();
      behaviorOptions.set(ResilienceBehavior, {
        handle: (err: unknown) => !(err instanceof NotFoundException),
        retry: { maxAttempts: 3 },
      });

      const ctx = createContext({
        handlerType: handlerClass,
        behaviorOptions,
      });

      const notFound = new NotFoundException('Role not found');
      const next = vi.fn().mockRejectedValue(notFound);

      await expect(resilienceBehavior.handle(ctx, next)).rejects.toThrow(
        NotFoundException,
      );
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 8. DeadLetterBehavior ────────────────────────────────────────────────
  describe('DeadLetterBehavior (@nestjs-pipeline/deadletter)', () => {
    it('swallows exception when rethrow is false on background events', async () => {
      const transport: DeadLetterTransport = {
        send: vi.fn().mockResolvedValue(undefined),
      };

      const deadLetterBehavior = new DeadLetterBehavior(transport);
      const behaviorOptions = new Map();
      behaviorOptions.set(DeadLetterBehavior, { rethrow: false });

      const ctx = createContext({
        requestKind: 'event',
        requestName: 'UserCreatedEvent',
        handlerName: 'UserCreatedHandler',
        behaviorOptions,
      });

      const next = vi.fn().mockRejectedValue(new Error('Queue unavailable'));

      // Should not throw because rethrow: false
      const result = await deadLetterBehavior.handle(ctx, next);
      expect(result).toBeUndefined();
      expect(transport.send).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 9. CaslBehavior ──────────────────────────────────────────────────────
  describe('CaslBehavior (@nestjs-pipeline/casl)', () => {
    it('verifies entity-level authorization with assertEntityPermission', () => {
      const ability = buildAbilityFromRules([
        { action: 'update', subject: 'Role', fields: ['name'] },
      ]);

      expect(() => {
        assertEntityPermission(ability, {
          action: 'update',
          subject: 'Role',
          entity: { id: '1', name: 'manager' },
          fields: ['name'],
        });
      }).not.toThrow();
    });
  });

  // ─── 10. LoggingBehavior ──────────────────────────────────────────────────
  describe('LoggingBehavior (@nestjs-pipeline/core)', () => {
    it('maps specific exceptions to warning log levels via mapLogLevel option', async () => {
      const mockLogger = {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const loggingBehavior = new LoggingBehavior(mockLogger as any);
      const behaviorOptions = new Map();
      behaviorOptions.set(LoggingBehavior, {
        requestResponseLogLevel: 'log',
        mapLogLevel: new Map([[UniqueRoleNameException, 'warn']]),
      });

      const ctx = createContext({
        requestName: 'CreateRoleCommand',
        handlerName: 'CreateRoleHandler',
        behaviorOptions,
      });

      const err = new UniqueRoleNameException({ name: 'existing-role' } as any);
      const next = vi.fn().mockRejectedValue(err);

      await expect(loggingBehavior.handle(ctx, next)).rejects.toThrow(
        UniqueRoleNameException,
      );
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // ─── 11. TraceBehavior ────────────────────────────────────────────────────
  describe('TraceBehavior (@nestjs-pipeline/opentelemetry)', () => {
    it('creates an OpenTelemetry span for the handler invocation when SDK is initialized', async () => {
      const mockSpan = {
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };

      const mockTracer = {
        startActiveSpan: vi.fn((_name: string, _options: any, fn: any) =>
          fn(mockSpan),
        ),
      };

      vi.spyOn(trace, 'getTracer').mockReturnValue(mockTracer as any);

      const traceBehavior = new TraceBehavior();
      (traceBehavior as any).sdkReady = true;

      const behaviorOptions = new Map();
      behaviorOptions.set(TraceBehavior, { tracerName: 'users-api' });

      const ctx = createContext({
        requestKind: 'query',
        requestName: 'GetRolesQuery',
        handlerName: 'GetRolesHandler',
        behaviorOptions,
      });

      const next = vi.fn().mockResolvedValue(['admin', 'editor']);
      const result = await traceBehavior.handle(ctx, next);

      expect(result).toEqual(['admin', 'editor']);
      expect(trace.getTracer).toHaveBeenCalledWith('users-api');
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'query.GetRolesQuery',
        expect.objectContaining({
          attributes: expect.objectContaining({
            'pipeline.request.name': 'GetRolesQuery',
            'pipeline.handler.name': 'GetRolesHandler',
          }),
        }),
        expect.any(Function),
      );
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  // ─── 12. ZodValidationBehavior ────────────────────────────────────────────
  describe('ZodValidationBehavior (@nestjs-pipeline/zod)', () => {
    it('validates request against static _zodSchema and throws ZodValidationError on mismatch', async () => {
      const zodBehavior = new ZodValidationBehavior();

      class ValidatedCommand {
        static _zodSchema = z.object({
          name: z.string().min(3),
        });
        constructor(public name: string) {}
      }

      const invalidReq = new ValidatedCommand('ab'); // less than 3 chars
      const ctx = createContext({
        request: invalidReq,
      });
      (ctx as any).requestType = ValidatedCommand;

      const next = vi.fn().mockResolvedValue('ok');

      await expect(zodBehavior.handle(ctx, next)).rejects.toThrow(
        ZodValidationError,
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});
