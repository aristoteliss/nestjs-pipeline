/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['**/*.spec.ts'],
    coverage: {
      enabled: true,
      include: [
        'index.ts',
        'application/**/*.ts',
        'domain/**/*.ts',
        'http/**/*.ts',
        'persistence/**/*.ts',
        'types/**/*.ts',
      ],
      thresholds: {
        perFile: true,
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
