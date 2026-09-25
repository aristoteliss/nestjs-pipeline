/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * The manifest must keep this package dependency-free and framework-neutral;
 * Biome's GritQL engine cannot match JSON, so the manifest is checked here.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Manifest {
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const read = (path: string) =>
  JSON.parse(readFileSync(resolve(__dirname, path), 'utf8')) as Manifest;
const manifest = read('../package.json');

describe('@cqrs-ddd/uuidv7 manifest', () => {
  it.each([
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const)('declares no %s', (field) => {
    expect(Object.keys(manifest[field] ?? {})).toEqual([]);
  });

  it('names no NestJS or @nestjs-pipeline package in devDependencies', () => {
    const names = Object.keys(manifest.devDependencies ?? {});

    expect(names.filter((name) => /^@?nestjs/.test(name))).toEqual([]);
  });

  it('requires the Node version the repository requires', () => {
    expect(manifest.engines?.node).toBe(
      read('../../../package.json').engines?.node,
    );
  });
});
