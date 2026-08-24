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
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
