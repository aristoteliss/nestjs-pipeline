/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * The domain entry point must stay free of the ORM.
 *
 * A single barrel used to export domain, application and persistence together,
 * so importing `DomainException` loaded MikroORM behind it and the layers
 * existed only as a naming convention. `@mikro-orm/core` is now an optional peer
 * that only `@nestjs-pipeline/ddd-core/persistence` requires — a claim worth
 * asserting rather than trusting, because a single stray import in any
 * transitively reachable file would quietly restore the old situation.
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = resolve(__dirname, '..');
let scriptDirectory: string;

beforeAll(() => {
  scriptDirectory = mkdtempSync(join(tmpdir(), 'ddd-core-entry-'));
});

afterAll(() => {
  rmSync(scriptDirectory, { recursive: true, force: true });
});

/**
 * Modules loaded when the given entry point is imported, as absolute paths.
 *
 * The probe runs in a fresh process because `require.cache` is process-wide: the
 * test runner has already loaded plenty, so measuring inside it would prove
 * nothing. The script is written to a file rather than passed with `-e`, whose
 * shell quoting mangles newlines.
 */
function loadedModules(entryPoint: string): string[] {
  const target = resolve(packageRoot, entryPoint);
  const scriptPath = join(scriptDirectory, 'probe.cjs');
  writeFileSync(
    scriptPath,
    [
      'const before = new Set(Object.keys(require.cache));',
      `require(${JSON.stringify(target)});`,
      'const loaded = Object.keys(require.cache).filter((m) => !before.has(m));',
      'process.stdout.write(JSON.stringify(loaded));',
    ].join('\n'),
  );

  return JSON.parse(
    execSync(`node ${JSON.stringify(scriptPath)}`, {
      encoding: 'utf8',
      cwd: packageRoot,
    }),
  );
}

describe('ddd-core entry points', () => {
  it('does not load MikroORM through the domain entry point', () => {
    const loaded = loadedModules('dist/domain/index.js');

    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.filter((m) => m.includes('@mikro-orm'))).toEqual([]);
  });

  it('does not load @nestjs through the domain entry point', () => {
    const loaded = loadedModules('dist/domain/index.js');

    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.filter((m) => m.includes('@nestjs'))).toEqual([]);
  });

  it('does not load MikroORM through the application entry point', () => {
    // Repository ports live here, so a CQRS handler needs nothing else.
    const loaded = loadedModules('dist/application/index.js');

    expect(loaded.filter((m) => m.includes('@mikro-orm'))).toEqual([]);
  });

  it('exposes the domain surface handlers and aggregates actually use', async () => {
    const domain = await import('./index');

    expect(domain.DomainException).toBeTypeOf('function');
    expect(domain.EntityNotFoundException).toBeTypeOf('function');
    expect(domain.ConcurrencyConflictError).toBeTypeOf('function');
    expect(domain.MissingTenantContextError).toBeTypeOf('function');
    expect(domain.TransientOperationError).toBeTypeOf('function');
    expect(domain.RootEntity).toBeTypeOf('function');
    expect(domain.AggregateRoot).toBeTypeOf('function');
  });

  it('exposes the repository ports from the application entry point', async () => {
    const application = await import('../application/index');

    expect(application.CommandBaseHandler).toBeTypeOf('function');
    expect(application.BaseCommand).toBeTypeOf('function');
    expect(application.BaseQuery).toBeTypeOf('function');
  });
});
