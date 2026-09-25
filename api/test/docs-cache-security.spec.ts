/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Documentation contract regression test for cache security invariants.
 *
 * Prevents reintroducing unsafe cache key patterns in documentation,
 * specifically ensuring that examples with entity-level or field-level
 * authorization do not demonstrate unpartitioned or tenant-fallback cache keys,
 * and that correlation IDs are never presented as cache security boundaries.
 */
describe('Documentation cache security contracts', () => {
  const usersApiReadmePath = resolve(__dirname, '..', 'README.md');
  const cacheReadmePath = resolve(
    __dirname,
    '..',
    '..',
    'packages',
    'pipeline-cache',
    'README.md',
  );
  const cacheHelpersReadmePath = resolve(
    __dirname,
    '..',
    '..',
    'packages',
    'pipeline-cache',
    'src',
    'helpers',
    'README.md',
  );

  const usersApiReadme = readFileSync(usersApiReadmePath, 'utf8');
  const cacheReadme = readFileSync(cacheReadmePath, 'utf8');
  const cacheHelpersReadme = readFileSync(cacheHelpersReadmePath, 'utf8');
  const allDocs = [usersApiReadme, cacheReadme, cacheHelpersReadme];

  it('does not contain unsafe tenant-only shared cache keys for authorized handlers', () => {
    expect(usersApiReadme).not.toContain(
      "ctx.tenantId ?? 'default'}:roles:all",
    );
    expect(usersApiReadme).not.toMatch(
      /key:\s*\(ctx\)\s*=>\s*`\$\{ctx\.tenantId.*:roles:all`/,
    );
  });

  it('does not demonstrate silent default tenant fallback in cache key factories', () => {
    for (const content of allDocs) {
      expect(content).not.toMatch(
        /key:\s*\(ctx\)\s*=>\s*`\$\{ctx\.tenantId\s*\?\?\s*['"]default['"]/,
      );
    }
  });

  it('documents the partitioned cache key contract', () => {
    expect(usersApiReadme).toContain('Authorization & Cache Security Scope');
    expect(usersApiReadme).toContain('createPartitionedCacheKeyFactory');
    expect(usersApiReadme).toContain('MissingCachePartitionError');

    expect(cacheReadme).toContain('createPartitionedCacheKeyFactory');
    expect(cacheReadme).toContain('MissingCachePartitionError');

    expect(cacheHelpersReadme).toContain('createPartitionedCacheKeyFactory');
    expect(cacheHelpersReadme).toContain('MissingCachePartitionError');
  });

  it('no longer presents a correlation-scoped key as safe by default across all documentation', () => {
    for (const content of allDocs) {
      expect(content).not.toMatch(/`defaultCacheKey\(\)`/);
      expect(content).not.toMatch(/defaultCacheKey\(\)\s+is\s+intentionally/i);
      expect(content).not.toMatch(
        /correlationId.*(security|authorization)\s+boundary/i,
      );
    }
  });
});
