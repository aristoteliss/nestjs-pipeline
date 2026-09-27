/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { JOB_PRINCIPAL, JOB_TENANTS } from './constants/job-context.constants';
import { MissingJobContextError } from './errors/missing-job-context.error';
import { activeRegistration } from './helpers/registration';
import type { IJobPrincipal } from './interfaces/job-principal.interface';
import { JobContextModule } from './job-context.module';

class Principal implements IJobPrincipal {
  capture() {
    return undefined;
  }

  async restore<T>(_principal: unknown, work: () => Promise<T>) {
    return work();
  }
}

class AuthModule {}

type Provider = {
  provide?: unknown;
  useClass?: unknown;
  useValue?: unknown;
};

function registrationClass() {
  const providers = JobContextModule.forRoot({
    principal: Principal,
    tenants: ['tenant_a'],
  }).providers as unknown[];
  return providers[2] as new (
    principal: IJobPrincipal,
    tenants: readonly string[],
  ) => { onApplicationShutdown(): void };
}

describe('JobContextModule', () => {
  it('binds the principal port and a copy of the tenants', () => {
    const tenants = ['tenant_a', 'tenant_b'];
    const module = JobContextModule.forRoot({
      principal: Principal,
      tenants,
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
  });

  it('imports nothing unless asked', () => {
    expect(
      JobContextModule.forRoot({ principal: Principal, tenants: ['tenant_a'] })
        .imports,
    ).toEqual([]);
  });

  it('refuses an empty tenant list', () => {
    expect(() =>
      JobContextModule.forRoot({ principal: Principal, tenants: [] }),
    ).toThrow(TypeError);
  });

  it('registers the principal and tenants when constructed and removes them at shutdown', () => {
    const Registration = registrationClass();
    const principal = new Principal();

    const instance = new Registration(principal, ['tenant_a']);

    expect(activeRegistration()).toEqual({ principal, tenants: ['tenant_a'] });
    instance.onApplicationShutdown();
    expect(() => activeRegistration()).toThrow(MissingJobContextError);
  });
});
