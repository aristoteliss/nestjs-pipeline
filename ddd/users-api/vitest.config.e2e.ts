/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

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
        find: /^@common\//,
        replacement: `${resolve(__dirname, 'src/common')}/`,
      },
      {
        find: /^@persistence\//,
        replacement: `${resolve(__dirname, 'src/persistence')}/`,
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
