/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { TenantEntityManagerResolver } from './tenant-entity-manager.resolver';

function orm(context: unknown, driver: object = {}) {
  const em = {
    getDriver: () => driver,
    getContext: vi.fn(() => context ?? em),
  };
  return { em, config: {} };
}

describe('TenantEntityManagerResolver', () => {
  it('keeps a reused manager with the first tenant that claimed it', () => {
    const resolver = new TenantEntityManagerResolver();
    const driver = {};
    const shared = { getDriver: () => driver };
    const source = orm(shared, driver);

    expect(resolver.resolve(source, 'tenant_a', () => ({}))).toBe(shared);

    const fork = {};
    expect(resolver.resolve(source, 'tenant_b', () => fork)).toBe(fork);
    expect(resolver.resolve(source, 'tenant_a', () => ({}))).toBe(shared);
  });

  it('never reuses a fork created for another tenant', () => {
    const resolver = new TenantEntityManagerResolver();
    const forkForA = resolver.fork('tenant_a', () => ({}));
    const replacement = {};

    expect(resolver.resolve(orm(forkForA), 'tenant_b', () => replacement)).toBe(
      replacement,
    );
  });

  it('forks instead of returning the global manager', () => {
    const resolver = new TenantEntityManagerResolver();
    const fork = {};

    expect(resolver.resolve(orm(undefined), 'tenant_a', () => fork)).toBe(fork);
  });

  it('forks when the context uses another driver instance', () => {
    const resolver = new TenantEntityManagerResolver();
    const context = { getDriver: () => ({}) };
    const fork = {};

    expect(resolver.resolve(orm(context), 'tenant_a', () => fork)).toBe(fork);
  });

  it('forks when resolving the context throws', () => {
    const resolver = new TenantEntityManagerResolver();
    const source = orm(undefined);
    source.em.getContext.mockImplementation(() => {
      throw new Error('no context');
    });
    const fork = {};

    expect(resolver.resolve(source, 'tenant_a', () => fork)).toBe(fork);
  });
});
