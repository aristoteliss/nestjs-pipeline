/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Documentation contract regression test for Architecture Finding #20.
 *
 * Prevents reintroducing unsafe cache key patterns in user documentation,
 * specifically ensuring that examples with entity-level or field-level
 * authorization do not demonstrate unpartitioned or tenant-fallback cache keys.
 */
describe('Documentation Cache Security Contract (Finding #20)', () => {
  const readmePath = join(__dirname, '..', 'README.md');
  const readmeContent = readFileSync(readmePath, 'utf8');

  it('does not contain unsafe tenant-only shared cache keys for authorized handlers', () => {
    expect(readmeContent).not.toContain("ctx.tenantId ?? 'default'}:roles:all");
    expect(readmeContent).not.toMatch(
      /key:\s*\(ctx\)\s*=>\s*`\$\{ctx\.tenantId.*:roles:all`/,
    );
  });

  it('does not demonstrate silent default tenant fallback in cache key factories', () => {
    expect(readmeContent).not.toMatch(
      /key:\s*\(ctx\)\s*=>\s*`\$\{ctx\.tenantId\s*\?\?\s*['"]default['"]/,
    );
  });

  it('documents the partitioned cache key contract', () => {
    expect(readmeContent).toContain('Authorization & Cache Security Scope');
    expect(readmeContent).toContain('createPartitionedCacheKeyFactory');
    expect(readmeContent).toContain('MissingCachePartitionError');
  });

  it('no longer presents a correlation-scoped key as safe by default', () => {
    // The removed default keyed on correlationId: it could never produce a hit,
    // and a client can supply its own correlation ID, so it was not an
    // authorization boundary either.
    expect(readmeContent).not.toMatch(
      /`defaultCacheKey\(\)` is safe by default/,
    );
  });
});
