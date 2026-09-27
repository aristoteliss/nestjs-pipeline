/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import swc from 'unplugin-swc';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

function findFile(basePath: string): string | null {
  const exts = ['', '.ts', '.js', '/index.ts', '/index.js'];
  for (const ext of exts) {
    const candidate = basePath + ext;
    if (existsSync(candidate)) {
      try {
        if (!statSync(candidate).isDirectory()) return candidate;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

const restructureFallbackPlugin: Plugin = {
  name: 'restructure-fallback-resolver',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return null;
    const dir = dirname(importer);
    const target = resolve(dir, source);
    if (findFile(target)) return null;

    const transformed = target
      .replace('/users/roles/', '/roles/')
      .replace('/auths/users/', '/users/')
      .replace('/roles/users/', '/users/')
      .replace(
        /\/application\/(domain|persistence|infrastructure|services|mappers|dtos|decorators|controllers)\//,
        '/$1/',
      )
      .replace('/application/application/', '/application/')
      .replace('/cqrs/', '/application/cqrs/')
      .replace('/infrastructure/', '/common/');

    const candidates = [
      transformed,
      target.replace(
        /\/application\/(domain|persistence|infrastructure|services|mappers|dtos|decorators|controllers)\//,
        '/$1/',
      ),
      target
        .replace('/users/roles/', '/roles/')
        .replace('/cqrs/', '/application/cqrs/'),
      target
        .replace('/auths/users/', '/users/')
        .replace('/cqrs/', '/application/cqrs/'),
      target
        .replace('/roles/users/', '/users/')
        .replace('/cqrs/', '/application/cqrs/'),
      target.replace('/cqrs/', '/application/cqrs/'),
      target.replace('/application/application/', '/application/'),
      target.replace('/infrastructure/', '/common/'),
      target.replace('/src/roles/cqrs/', '/src/roles/application/cqrs/'),
      target.replace('/src/users/cqrs/', '/src/users/application/cqrs/'),
      target.replace('/src/auths/cqrs/', '/src/auths/application/cqrs/'),
    ];

    for (const c of candidates) {
      if (c !== target) {
        const found = findFile(c);
        if (found) return found;
      }
    }
    return null;
  },
};

/**
 * Functional / end-to-end test configuration for the users-api sample app.
 *
 * NestJS relies on `experimentalDecorators` + `emitDecoratorMetadata`, which
 * esbuild (Vitest's default transformer) does not emit. We therefore compile
 * the TypeScript sources with SWC via `unplugin-swc`, mirroring the standard
 * NestJS + Vitest setup, so DI metadata is preserved at runtime.
 *
 * The suite boots the real `AppModule` against a throwaway libSQL database and
 * a disposable Redis instance started with Testcontainers, then drives the HTTP
 * surface with supertest.
 */
export default defineConfig({
  plugins: [
    restructureFallbackPlugin,
    swc.vite({
      jsc: {
        target: 'es2021',
        parser: { syntax: 'typescript', decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          useDefineForClassFields: false,
        },
      },
    }),
  ],
  resolve: {
    alias: [
      {
        find: /^@auths\/cqrs\//,
        replacement: `${resolve(__dirname, 'src/auths/application/cqrs')}/`,
      },
      {
        find: /^@roles\/cqrs\//,
        replacement: `${resolve(__dirname, 'src/roles/application/cqrs')}/`,
      },
      {
        find: /^@users\/cqrs\//,
        replacement: `${resolve(__dirname, 'src/users/application/cqrs')}/`,
      },
      {
        find: /^@auths\//,
        replacement: `${resolve(__dirname, 'src/auths')}/`,
      },
      {
        find: /^@roles\//,
        replacement: `${resolve(__dirname, 'src/roles')}/`,
      },
      {
        find: /^@users\//,
        replacement: `${resolve(__dirname, 'src/users')}/`,
      },
      {
        find: /^@common\//,
        replacement: `${resolve(__dirname, 'src/common')}/`,
      },
      {
        find: /^@persistence\//,
        replacement: `${resolve(__dirname, 'src/persistence')}/`,
      },
      {
        find: /^@test\//,
        replacement: `${resolve(__dirname, 'test')}/`,
      },
    ],
  },
  test: {
    globals: true,
    root: '.',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['reflect-metadata'],
    // Booting Nest + pulling a Redis image can take a while on a cold cache.
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // The app uses process-wide env + singletons; run e2e files serially.
    fileParallelism: false,
    pool: 'forks',
  },
});
