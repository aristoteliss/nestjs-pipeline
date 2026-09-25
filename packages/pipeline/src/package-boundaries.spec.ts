/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Packaging invariants for the published `packages/*` workspaces.
 *
 * These live in a test rather than in a Grit plugin because Biome's GritQL engine
 * only parses JavaScript and TypeScript — a `language json` pattern compiles but
 * never matches, so a manifest rule written that way would silently pass.
 *
 * They belong to this package specifically: `@nestjs-pipeline/core` owns
 * process-wide singletons, so it is core's own contract that every sibling
 * resolves exactly one copy of it.
 */

const CORE = '@nestjs-pipeline/core';
const DDD_PREFIX = '@nestjs-pipeline/ddd-';
const SCOPE = '@nestjs-pipeline/';
const NEUTRAL_SCOPE = '@cqrs-ddd/';
const DDD_CORE = '@cqrs-ddd/core';

const PACKAGES_DIR = resolve(__dirname, '../..');

interface Manifest {
  name: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function manifests(): Manifest[] {
  return readdirSync(PACKAGES_DIR)
    .map((entry) => join(PACKAGES_DIR, entry, 'package.json'))
    .filter((file) => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    })
    .map((file) => JSON.parse(readFileSync(file, 'utf8')) as Manifest)
    .filter((manifest) => manifest.private !== true);
}

const published = manifests();
const siblings = published.filter(
  (manifest) => manifest.name.startsWith(SCOPE) && manifest.name !== CORE,
);
const neutral = published.filter((manifest) =>
  manifest.name.startsWith(NEUTRAL_SCOPE),
);

describe('published package boundaries', () => {
  it('discovers every workspace under packages/', () => {
    expect(published.length).toBeGreaterThanOrEqual(12);
    expect(published.map((m) => m.name)).toContain(CORE);
  });

  it.each(siblings.map((m) => m.name))(
    '%s declares the core package as a peer, never as a runtime dependency',
    (name) => {
      const manifest = siblings.find((m) => m.name === name) as Manifest;

      // A runtime dependency lets a consumer resolve a second copy of core. The
      // `pipelineStore` AsyncLocalStorage and every Symbol()-keyed context setter
      // are module-scoped, so a duplicate copy silently drops correlation IDs,
      // tenant IDs and behavior deduplication with no error at all.
      expect(manifest.dependencies ?? {}).not.toHaveProperty(CORE);
      expect(manifest.peerDependencies ?? {}).toHaveProperty(CORE);
    },
  );

  it.each(siblings.map((m) => m.name))(
    '%s pins core through the workspace protocol so releases need no manual edit',
    (name) => {
      const manifest = siblings.find((m) => m.name === name) as Manifest;

      // pnpm rewrites `workspace:^` to `^<core version>` when the tarball is built,
      // so the published range tracks core automatically. A literal range here has
      // to be updated in every sibling on every core release, and silently goes
      // stale when it is not.
      expect(manifest.peerDependencies?.[CORE]).toBe('workspace:^');
    },
  );

  it('gives core no runtime dependency except the framework-neutral @cqrs-ddd utilities', () => {
    const core = published.find((m) => m.name === CORE) as Manifest;

    // They hold no module-scoped state, so a second copy in a consumer is
    // harmless; anything else would be a runtime dependency beyond NestJS.
    expect(core.dependencies ?? {}).toEqual({
      '@cqrs-ddd/safe-stringify': 'workspace:^',
      '@cqrs-ddd/uuidv7': 'workspace:^',
    });
  });

  it('places every workspace in one of the two published scopes', () => {
    expect(
      published.filter(
        (m) => !m.name.startsWith(SCOPE) && !m.name.startsWith(NEUTRAL_SCOPE),
      ),
    ).toEqual([]);
    expect(neutral.map((m) => m.name)).toContain('@cqrs-ddd/uuidv7');
  });

  it.each(neutral.map((m) => m.name))(
    '%s is framework-neutral: no dependency or peer on core or any @nestjs-pipeline package',
    (name) => {
      const manifest = neutral.find((m) => m.name === name) as Manifest;
      const named = [
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
      ];

      expect(
        named.filter((dependency) => /^@?nestjs/.test(dependency)),
      ).toEqual([]);
    },
  );

  it(`lets no ${SCOPE}* package name ${DDD_CORE}`, () => {
    const naming = published
      .filter((m) => m.name.startsWith(SCOPE))
      .filter((m) =>
        [
          m.dependencies,
          m.peerDependencies,
          m.optionalDependencies,
          m.devDependencies,
        ].some((field) => field !== undefined && DDD_CORE in field),
      )
      .map((m) => m.name);

    // The pipeline packages and the DDD core know nothing of each other; only
    // an application connects them.
    expect(naming).toEqual([]);
  });

  it.each(published.map((m) => m.name))(
    '%s has no runtime dependency on a sibling or on the private api workspace',
    (name) => {
      const manifest = published.find((m) => m.name === name) as Manifest;
      const offenders = Object.keys(manifest.dependencies ?? {}).filter(
        (dependency) => dependency.startsWith(SCOPE) && dependency !== CORE,
      );

      // Behavior packages are independent by design, and the private `api` example
      // carries a different license boundary.
      expect(offenders).toEqual([]);
      expect(offenders.filter((d) => d.startsWith(DDD_PREFIX))).toEqual([]);
    },
  );
});
