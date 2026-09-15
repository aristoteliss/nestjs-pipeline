/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['src/**/*.spec.ts'],
  },
});
