/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Every entry point must stay free of NestJS and of any ORM.
 *
 * The package is framework- and ORM-neutral. One stray import in any file an
 * entry point reaches would load NestJS or MikroORM behind it, so the built
 * output is checked rather than trusted.
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');
let scriptDirectory: string;

beforeAll(() => {
  scriptDirectory = mkdtempSync(join(tmpdir(), 'ddd-core-entry-'));
});

afterAll(() => {
  rmSync(scriptDirectory, { recursive: true, force: true });
});

/**
 * Modules resolved when the given entry point is imported, as URLs.
 *
 * The probe runs in a fresh process because the module caches are process-wide:
 * the test runner has already loaded plenty, so measuring inside it would prove
 * nothing. A resolve hook sees every `import` and `require()` the entry point
 * makes, ES modules and CommonJS alike. The script is written to a file rather
 * than passed with `-e`, whose shell quoting mangles newlines.
 */
function loadedModules(entryPoint: string): string[] {
  const target = pathToFileURL(resolve(packageRoot, entryPoint)).href;
  const scriptPath = join(scriptDirectory, 'probe.mjs');
  writeFileSync(
    scriptPath,
    [
      "import { registerHooks } from 'node:module';",
      'const loaded = [];',
      'registerHooks({',
      '  resolve(specifier, context, nextResolve) {',
      '    const resolved = nextResolve(specifier, context);',
      '    loaded.push(resolved.url);',
      '    return resolved;',
      '  },',
      '});',
      `await import(${JSON.stringify(target)});`,
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
  it.each([
    'dist/index.js',
    'dist/domain/index.js',
    'dist/application/index.js',
    'dist/persistence/index.js',
    'dist/http/index.js',
  ])('does not load @nestjs through %s', (entryPoint) => {
    // The package is framework-neutral: a consumer without NestJS must be able
    // to load every entry point. framework-independence.grit rejects the
    // imports; this checks what the built output actually loads.
    const loaded = loadedModules(entryPoint);

    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.filter((m) => m.includes('@nestjs'))).toEqual([]);
  });

  it.each([
    'dist/index.js',
    'dist/domain/index.js',
    'dist/application/index.js',
    'dist/persistence/index.js',
    'dist/http/index.js',
  ])('does not load MikroORM through %s', (entryPoint) => {
    // orm-independence.grit rejects the imports; this checks what the built
    // output actually loads.
    const loaded = loadedModules(entryPoint);

    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.filter((m) => m.includes('@mikro-orm'))).toEqual([]);
  });

  it('exposes the domain surface handlers and aggregates actually use', async () => {
    const domain = await import('./index.js');

    expect(domain.DomainException).toBeTypeOf('function');
    expect(domain.EntityNotFoundException).toBeTypeOf('function');
    expect(domain.ConcurrencyConflictError).toBeTypeOf('function');
    expect(domain.MissingTenantContextError).toBeTypeOf('function');
    expect(domain.TransientOperationError).toBeTypeOf('function');
    expect(domain.RootEntity).toBeTypeOf('function');
    expect(domain.AggregateRoot).toBeTypeOf('function');
  });

  it('exposes the repository ports from the application entry point', async () => {
    const application = await import('../application/index.js');

    expect(application.CommandBaseHandler).toBeTypeOf('function');
    expect(application.BaseCommand).toBeTypeOf('function');
    expect(application.BaseQuery).toBeTypeOf('function');
  });
});
