/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * The manifest must not bring NestJS in, even without an import; Biome's GritQL
 * engine cannot match JSON, so the manifest is checked here.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Manifest {
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  optionalDependencies?: Record<string, string>;
}

const manifest = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8'),
) as Manifest;

describe('ddd-core manifest', () => {
  it.each([
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const)('names no NestJS package in %s', (field) => {
    const names = Object.keys(manifest[field] ?? {});

    expect(names.filter((name) => /^@?nestjs/.test(name))).toEqual([]);
  });

  it('depends at runtime only on the framework-neutral @cqrs-ddd packages', () => {
    // Pure utilities with no identity: a duplicate copy is harmless, so they are
    // dependencies rather than peers a consumer must install.
    expect(manifest.dependencies ?? {}).toEqual({
      '@cqrs-ddd/safe-stringify': 'workspace:^',
      '@cqrs-ddd/uuidv7': 'workspace:^',
    });
  });

  it('keeps MikroORM as its only peer, and an optional one', () => {
    // Required only by /persistence and the root barrel, so a consumer of
    // /domain or /application must not be asked to install it.
    expect(Object.keys(manifest.peerDependencies ?? {})).toEqual([
      '@mikro-orm/core',
    ]);
    expect(manifest.peerDependenciesMeta?.['@mikro-orm/core']?.optional).toBe(
      true,
    );
  });

  it('requires the Node version the repository requires', () => {
    const root = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
    ) as Manifest;

    expect(manifest.engines?.node).toBe(root.engines?.node);
  });
});
