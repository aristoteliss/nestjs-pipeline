/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Logger } from '@nestjs/common';

const logger = new Logger('CacheDecorators');
const reportedOwners = new WeakSet<object>();

/**
 * Reports, once per repository class, a cache decorator running on an instance
 * that has no `cache` property. Such a repository is miswired: cache
 * maintenance and read-through are skipped. An instance that declares `cache`
 * and leaves it unset is intentionally uncached and is not reported.
 */
export function reportMissingCacheProperty(
  instance: object,
  decorator: '@Cache' | '@FromCache',
): void {
  const owner = instance.constructor;
  if ('cache' in instance || reportedOwners.has(owner)) return;
  reportedOwners.add(owner);
  logger.warn(
    `${owner.name} uses ${decorator} but has no \`cache\` property, so caching is skipped. ` +
      'Extend CommandRepository/QueryRepository or declare a `cache` property.',
  );
}
