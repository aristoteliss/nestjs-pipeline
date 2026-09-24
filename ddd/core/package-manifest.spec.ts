/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * The manifest must not bring NestJS in either.
 *
 * `framework-independence.grit` rejects NestJS imports, but a manifest entry
 * reaches consumers without any import: every dependency is installed with the
 * package, and every required peer must be installed next to it. Biome's GritQL
 * engine cannot match JSON, so the manifest is checked here.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Manifest {
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
  ] as const)('names no NestJS or @nestjs-pipeline package in %s', (field) => {
    const names = Object.keys(manifest[field] ?? {});

    expect(names.filter((name) => /^@?nestjs/.test(name))).toEqual([]);
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
});
