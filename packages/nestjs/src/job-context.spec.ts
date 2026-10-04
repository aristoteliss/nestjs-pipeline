/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IJobPrincipal } from '@cqrs-ddd/pipeline-job-context';
import { Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

const unregister = vi.fn();
const registerJobContext = vi.fn(() => unregister);

vi.mock('@cqrs-ddd/pipeline-job-context', () => ({ registerJobContext }));

const { JobContextModule } = await import('./job-context.js');

@Injectable()
class Users {}

@Module({ providers: [Users], exports: [Users] })
class UsersModule {}

@Injectable()
class SessionPrincipal implements IJobPrincipal {
  constructor(readonly users: Users) {}
  capture() {
    return undefined;
  }
  restore<T>(_principal: unknown, work: () => Promise<T>) {
    return work();
  }
}

const sources = {
  tenantId: { get: () => undefined, run: <T>(_v: string, fn: () => T) => fn() },
};

describe('JobContextModule', () => {
  afterEach(() => vi.clearAllMocks());

  it.each([
    ['a list', ['tenant_a']],
    ['a function', () => ['tenant_a']],
  ])(
    'registers the principal, tenants given as %s and sources, and unregisters on shutdown',
    async (_label, tenants) => {
      const app = await NestFactory.createApplicationContext(
        JobContextModule.forRoot({
          imports: [UsersModule],
          principal: SessionPrincipal,
          tenants,
          sources: sources as never,
        }),
        { logger: false },
      );

      expect(registerJobContext).toHaveBeenCalledExactlyOnceWith({
        principal: expect.any(SessionPrincipal),
        tenants: ['tenant_a'],
        sources,
      });
      expect(unregister).not.toHaveBeenCalled();

      await app.close();

      expect(unregister).toHaveBeenCalledOnce();
    },
  );

  it('needs no imports when the principal has no dependencies', async () => {
    @Injectable()
    class SystemPrincipal implements IJobPrincipal {
      capture() {
        return undefined;
      }
      restore<T>(_principal: unknown, work: () => Promise<T>) {
        return work();
      }
    }

    const app = await NestFactory.createApplicationContext(
      JobContextModule.forRoot({
        principal: SystemPrincipal,
        tenants: ['tenant_a'],
        sources: sources as never,
      }),
      { logger: false },
    );
    await app.close();

    expect(registerJobContext).toHaveBeenCalledOnce();
  });
});
