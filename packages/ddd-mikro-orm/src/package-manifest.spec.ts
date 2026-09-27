/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Biome's GritQL engine cannot match JSON, so the manifest's dependency rules
 * are checked here.
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

const read = (path: string) =>
  JSON.parse(readFileSync(resolve(__dirname, path), 'utf8')) as Manifest;
const manifest = read('../package.json');

describe('ddd-mikro-orm manifest', () => {
  it.each([
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const)('names no NestJS package in %s', (field) => {
    const names = Object.keys(manifest[field] ?? {});

    expect(names.filter((name) => /^@?nestjs/.test(name))).toEqual([]);
  });

  it('has no runtime dependencies', () => {
    expect(manifest.dependencies ?? {}).toEqual({});
  });

  it('requires @cqrs-ddd/core and MikroORM as peers', () => {
    expect(Object.keys(manifest.peerDependencies ?? {}).sort()).toEqual([
      '@cqrs-ddd/core',
      '@mikro-orm/core',
    ]);
    expect(manifest.peerDependenciesMeta ?? {}).toEqual({});
  });

  it('develops against the MikroORM range it declares', () => {
    expect(manifest.devDependencies?.['@mikro-orm/core']).toBe(
      manifest.peerDependencies?.['@mikro-orm/core'],
    );
  });

  it('requires the Node version the repository requires', () => {
    expect(manifest.engines?.node).toBe(
      read('../../../package.json').engines?.node,
    );
  });
});
