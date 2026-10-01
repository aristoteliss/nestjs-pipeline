/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import {
  JOB_PRINCIPAL,
  JOB_SOURCES,
  JOB_TENANTS,
} from './constants/job-context.constants.js';
import { MissingJobContextError } from './errors/missing-job-context.error.js';
import { activeRegistration } from './helpers/registration.js';
import type { JobContextSources } from './interfaces/context-source.interface.js';
import type { IJobPrincipal } from './interfaces/job-principal.interface.js';
import { JobContextModule } from './job-context.module.js';

class Principal implements IJobPrincipal {
  capture() {
    return undefined;
  }

  async restore<T>(_principal: unknown, work: () => Promise<T>) {
    return work();
  }
}

class AuthModule {}

const sources: JobContextSources = {
  tenantId: { current: () => undefined, run: (_value, fn) => fn() },
  correlationId: {
    current: () => undefined,
    run: (_value, fn) => fn(),
    accepts: () => true,
    create: () => 'created-id',
  },
};

type Provider = {
  provide?: unknown;
  useClass?: unknown;
  useValue?: unknown;
  useFactory?: () => unknown;
};

function registrationClass() {
  const providers = JobContextModule.forRoot({
    principal: Principal,
    tenants: ['tenant_a'],
    sources,
  }).providers as unknown[];
  return providers[3] as new (
    principal: IJobPrincipal,
    tenants: readonly string[],
    sources: JobContextSources,
  ) => { onApplicationShutdown(): void };
}

describe('JobContextModule', () => {
  it('binds the principal port, a copy of the tenants and the sources', () => {
    const tenants = ['tenant_a', 'tenant_b'];
    const module = JobContextModule.forRoot({
      principal: Principal,
      tenants,
      sources,
      imports: [AuthModule],
    });
    const providers = module.providers as Provider[];

    expect(module.module).toBe(JobContextModule);
    expect(module.imports).toEqual([AuthModule]);
    expect(providers[0]).toEqual({
      provide: JOB_PRINCIPAL,
      useClass: Principal,
    });
    expect(providers[1]).toEqual({ provide: JOB_TENANTS, useValue: tenants });
    expect(providers[1].useValue).not.toBe(tenants);
    expect(providers[2]).toEqual({ provide: JOB_SOURCES, useValue: sources });
  });

  it('imports nothing unless asked', () => {
    expect(
      JobContextModule.forRoot({
        principal: Principal,
        tenants: ['tenant_a'],
        sources,
      }).imports,
    ).toEqual([]);
  });

  it('refuses an empty tenant list', () => {
    expect(() =>
      JobContextModule.forRoot({ principal: Principal, tenants: [], sources }),
    ).toThrow(TypeError);
  });

  it('calls a tenant function when the application builds the provider, not in forRoot', () => {
    const tenants = vi.fn(() => ['tenant_a', 'tenant_b']);
    const providers = JobContextModule.forRoot({
      principal: Principal,
      tenants,
      sources,
    }).providers as Provider[];

    expect(tenants).not.toHaveBeenCalled();
    expect(providers[1].provide).toBe(JOB_TENANTS);
    expect(providers[1].useFactory?.()).toEqual(['tenant_a', 'tenant_b']);
    expect(tenants).toHaveBeenCalledOnce();
  });

  it('refuses an empty list from a tenant function when the application starts', () => {
    const providers = JobContextModule.forRoot({
      principal: Principal,
      tenants: () => [],
      sources,
    }).providers as Provider[];

    expect(() => providers[1].useFactory?.()).toThrow(TypeError);
  });

  it('registers the principal, tenants and sources when constructed and removes them at shutdown', () => {
    const Registration = registrationClass();
    const principal = new Principal();

    const instance = new Registration(principal, ['tenant_a'], sources);

    expect(activeRegistration()).toEqual({
      principal,
      tenants: ['tenant_a'],
      sources,
    });
    instance.onApplicationShutdown();
    expect(() => activeRegistration()).toThrow(MissingJobContextError);
  });
});
