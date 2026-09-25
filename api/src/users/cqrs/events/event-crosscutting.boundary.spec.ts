/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const eventHandlerSource = (name: string) =>
  readFileSync(join(__dirname, name), 'utf8');

describe('event handler cross-cutting boundary', () => {
  it.each(['user-created.handler.ts', 'user-updated.handler.ts'])(
    '%s leaves logging and correlation to the global pipeline',
    (filename) => {
      const source = eventHandlerSource(filename);
      expect(source).not.toContain('new Logger(');
      expect(source).not.toContain('getCorrelationId');
      expect(source).not.toContain('@nestjs-pipeline/correlation');
    },
  );
});
