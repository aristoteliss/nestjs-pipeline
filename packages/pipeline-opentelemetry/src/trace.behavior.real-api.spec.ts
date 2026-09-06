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

import { IPipelineContext } from '@nestjs-pipeline/core';
import { trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSdkInitialized, TraceBehavior } from './trace.behavior';

describe('TraceBehavior (real OpenTelemetry API)', () => {
  beforeEach(() => {
    // Reset global tracer provider to uninitialized ProxyTracerProvider
    trace.disable();
  });

  afterEach(() => {
    trace.disable();
  });

  it('detects uninitialized SDK in clean process (does not treat default NoopTracerProvider as active)', () => {
    // In a clean process, trace.getTracerProvider() has a NoopTracerProvider delegate
    expect(isSdkInitialized()).toBe(false);

    const logger = {
      warn: vi.fn(),
      log: vi.fn(),
    };
    const behavior = new TraceBehavior(logger as never);
    behavior.onModuleInit();

    expect((behavior as any).sdkReady).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('OpenTelemetry SDK is NOT initialized'),
      TraceBehavior.name,
    );
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('passes through execution when SDK is not initialized', async () => {
    const behavior = new TraceBehavior();
    behavior.onModuleInit();

    const next = vi.fn().mockResolvedValue('pipeline-output');
    const ctx = {
      requestKind: 'command',
      requestName: 'CreateUserCommand',
      handlerName: 'CreateUserHandler',
      correlationId: 'test-corr-id',
      startedAt: new Date(),
      getBehaviorOptions: vi.fn().mockReturnValue(undefined),
    } as unknown as IPipelineContext;

    const result = await behavior.handle(ctx, next);
    expect(result).toBe('pipeline-output');
    expect(next).toHaveBeenCalledOnce();
  });

  it('detects real initialized TracerProvider as active and emits spans', async () => {
    const activeSpanMock = {
      setStatus: vi.fn(),
      end: vi.fn(),
      recordException: vi.fn(),
    };
    const realTracer = {
      startActiveSpan: vi.fn(
        (name: string, opts: any, fn: (span: any) => any) => fn(activeSpanMock),
      ),
    };
    const realProvider = {
      getTracer: vi.fn().mockReturnValue(realTracer),
    };

    trace.setGlobalTracerProvider(realProvider as any);

    expect(isSdkInitialized()).toBe(true);

    const logger = {
      warn: vi.fn(),
      log: vi.fn(),
    };
    const behavior = new TraceBehavior(logger as never);
    behavior.onModuleInit();

    expect((behavior as any).sdkReady).toBe(true);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('OpenTelemetry tracer provider is active'),
      TraceBehavior.name,
    );
    expect(logger.warn).not.toHaveBeenCalled();

    const next = vi.fn().mockResolvedValue('success');
    const ctx = {
      requestKind: 'command',
      requestName: 'CreateUserCommand',
      handlerName: 'CreateUserHandler',
      correlationId: 'real-corr-id',
      startedAt: new Date(),
      getBehaviorOptions: vi.fn().mockReturnValue(undefined),
    } as unknown as IPipelineContext;

    const result = await behavior.handle(ctx, next);
    expect(result).toBe('success');
    expect(realTracer.startActiveSpan).toHaveBeenCalledWith(
      'command.CreateUserCommand',
      expect.anything(),
      expect.any(Function),
    );
    expect(activeSpanMock.end).toHaveBeenCalledOnce();
  });

  it('respects per-handler enabled: false override even when SDK is initialized', async () => {
    const realTracer = {
      startActiveSpan: vi.fn(),
    };
    const realProvider = {
      getTracer: vi.fn().mockReturnValue(realTracer),
    };
    trace.setGlobalTracerProvider(realProvider as any);

    const behavior = new TraceBehavior();
    behavior.onModuleInit();
    expect((behavior as any).sdkReady).toBe(true);

    const next = vi.fn().mockResolvedValue('bypassed');
    const ctx = {
      requestKind: 'query',
      requestName: 'GetUserQuery',
      handlerName: 'GetUserHandler',
      correlationId: 'bypassed-corr-id',
      startedAt: new Date(),
      getBehaviorOptions: vi.fn().mockReturnValue({ enabled: false }),
    } as unknown as IPipelineContext;

    const result = await behavior.handle(ctx, next);
    expect(result).toBe('bypassed');
    expect(realTracer.startActiveSpan).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});

