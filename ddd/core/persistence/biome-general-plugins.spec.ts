/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
let directory: string;

function lintFixture(relativePath: string, source: string) {
  const target = resolve(directory, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
  const result = spawnSync(
    resolve(root, 'node_modules/.bin/biome'),
    ['lint', `--config-path=${directory}`, target],
    { encoding: 'utf8', cwd: directory },
  );
  if (result.error) throw result.error;
  return { status: result.status, diagnostics: result.stdout + result.stderr };
}

beforeAll(() => {
  directory = mkdtempSync(resolve(tmpdir(), 'biome-general-plugins-'));
  const configuration = JSON.parse(
    readFileSync(resolve(root, 'biome.json'), 'utf8'),
  );
  configuration.plugins = configuration.plugins.map(
    (plugin: { path: string; includes: string[] }) => ({
      ...plugin,
      path: resolve(root, plugin.path),
    }),
  );
  configuration.linter.rules = { recommended: false };
  configuration.overrides = [];
  writeFileSync(
    resolve(directory, 'biome.json'),
    JSON.stringify(configuration),
  );
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('Biome Grit test-suite plugin', () => {
  it('accepts standard test structures without focused executions', () => {
    const source = `
      import { describe, it, expect } from 'vitest';
      describe('my-suite', () => {
        it('passes', () => {
          expect(1).toBe(1);
        });
      });
    `;
    expect(
      lintFixture('packages/test-pkg/sample.spec.ts', source),
    ).toMatchObject({
      status: 0,
    });
  });

  it.each(['describe.only', 'it.only', 'test.only', 'fit', 'fdescribe'])(
    'rejects focused execution %s in test files',
    (token) => {
      const source = `
        import { describe, it, test } from 'vitest';
        ${token}('should fail', () => {});
      `;
      const result = lintFixture(
        'packages/test-pkg/sample-focused.spec.ts',
        source,
      );
      expect(result.status).toBe(1);
      expect(result.diagnostics).toContain('Do not commit focused tests');
    },
  );
});

describe('Biome Grit verify-package-licenses plugin', () => {
  it('accepts standalone package imports', () => {
    const source = `
      import { Injectable } from '@nestjs/common';
      import { IPipelineBehavior } from '@nestjs-pipeline/core';
      export class MyBehavior implements IPipelineBehavior {}
    `;
    expect(lintFixture('packages/my-lib/src/index.ts', source)).toMatchObject({
      status: 0,
    });
  });

  it('rejects standalone package imports leaking into ddd application modules', () => {
    const source = `
      import { User } from '../../ddd/users-api/src/users/domain/models/user.entity';
    `;
    const result = lintFixture('packages/my-lib/src/leaking.ts', source);
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'preserve standalone package license boundaries',
    );
  });
});

describe('Biome Grit package-licenses plugin', () => {
  it('accepts public NestJS framework imports', () => {
    const source = `
      import { Injectable, Module } from '@nestjs/common';
      import { CqrsModule } from '@nestjs/cqrs';
    `;
    expect(
      lintFixture('packages/my-lib/src/framework.ts', source),
    ).toMatchObject({
      status: 0,
    });
  });

  it('rejects private NestJS framework internal imports in packages', () => {
    const source = `
      import { RouterExecutionContext } from '@nestjs/core/router/router-execution-context';
    `;
    const result = lintFixture(
      'packages/my-lib/src/private-framework.ts',
      source,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'Do not import private NestJS framework internals',
    );
  });
});
