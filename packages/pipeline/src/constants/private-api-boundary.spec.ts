import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function collectTypeScriptFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory()
      ? collectTypeScriptFiles(path)
      : path.endsWith('.ts')
        ? [path]
        : [];
  });
}

describe('pipeline private CQRS metadata boundary', () => {
  it('does not depend on private decorator metadata constants', () => {
    const srcRoot = join(__dirname, '..');
    const offenders = collectTypeScriptFiles(srcRoot)
      .filter((path) => path !== __filename)
      .filter((path) =>
        readFileSync(path, 'utf8').includes(
          '@nestjs/cqrs/dist/decorators/constants',
        ),
      );

    expect(offenders).toEqual([]);
  });
});
