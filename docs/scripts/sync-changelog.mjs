/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Copies the repository's `CHANGELOG.md` into the site as its Changelog page, so
 * the release history has one source. Links to the published site become site
 * paths, which the build's link check then verifies.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const site = 'https://aristoteliss.github.io/nestjs-pipeline/';

const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
const heading = /^# (.+)$/m.exec(changelog);
if (!heading)
  throw new Error('CHANGELOG.md: no level-one heading to title the page');

const body = changelog
  .replace(heading[0], '')
  .replace(/^\s+/, '')
  .replaceAll(`](${site}`, '](/nestjs-pipeline/');

writeFileSync(
  resolve(import.meta.dirname, '../src/content/docs/changelog.md'),
  `---\ntitle: ${JSON.stringify(heading[1].trim())}\neditUrl: false\n---\n\n${body}`,
);
console.log('Synced CHANGELOG.md into docs/src/content/docs/changelog.md');
