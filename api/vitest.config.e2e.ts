/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

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
        replacement: `${resolve(import.meta.dirname, 'src/auths/application/cqrs')}/`,
      },
      {
        find: /^@roles\/cqrs\//,
        replacement: `${resolve(import.meta.dirname, 'src/roles/application/cqrs')}/`,
      },
      {
        find: /^@users\/cqrs\//,
        replacement: `${resolve(import.meta.dirname, 'src/users/application/cqrs')}/`,
      },
      {
        find: /^@auths\//,
        replacement: `${resolve(import.meta.dirname, 'src/auths')}/`,
      },
      {
        find: /^@roles\//,
        replacement: `${resolve(import.meta.dirname, 'src/roles')}/`,
      },
      {
        find: /^@users\//,
        replacement: `${resolve(import.meta.dirname, 'src/users')}/`,
      },
      {
        find: /^@common\//,
        replacement: `${resolve(import.meta.dirname, 'src/common')}/`,
      },
      {
        find: /^@persistence\//,
        replacement: `${resolve(import.meta.dirname, 'src/persistence')}/`,
      },
      {
        find: /^@test\//,
        replacement: `${resolve(import.meta.dirname, 'test')}/`,
      },
    ],
  },
  test: {
    // The workspace packages load natively, as in production. Run by Vite instead,
    // a package is reloaded by `vi.resetModules()`, losing registrations such as
    // `setTenantResolver`, and `vi.mock` reaches into its code.
    server: { deps: { external: [/\/packages\/[^/]+\/dist\//] } },
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
