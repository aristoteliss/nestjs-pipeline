/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const repositoryPath =
  'ddd/users-api/src/roles/persistence/update-role.command-repository.ts';
const current = readFileSync(resolve(root, repositoryPath), 'utf8');
const valid = `
import { Cache, AcknowledgePersisted, MapPersistenceErrors, optimisticUpdate } from '@nestjs-pipeline/ddd-core/persistence';
class UpdateRoleCommandRepository {
  @Cache(key)
  @AcknowledgePersisted(options)
  @MapPersistenceErrors(options)
  async save(role) { await optimisticUpdate(em, Role, role, data, 'Role'); return role; }
}`;
let directory: string;
let fixture: string;

function lint(source: string) {
  writeFileSync(fixture, source);
  const result = spawnSync(
    resolve(root, 'node_modules/.bin/biome'),
    ['lint', `--config-path=${directory}`, fixture],
    { encoding: 'utf8', cwd: directory },
  );
  if (result.error) throw result.error;
  return { status: result.status, diagnostics: result.stdout + result.stderr };
}

beforeAll(() => {
  directory = mkdtempSync(resolve(tmpdir(), 'biome-persistence-'));
  fixture = resolve(directory, repositoryPath);
  mkdirSync(dirname(fixture), { recursive: true });
  const configuration = JSON.parse(
    readFileSync(resolve(root, 'biome.json'), 'utf8'),
  );
  configuration.plugins = configuration.plugins.map(
    (plugin: { path: string; includes: string[] }) => ({
      ...plugin,
      path: resolve(root, plugin.path),
    }),
  );
  // Keep the real plugin registration/filtering; unrelated style rules do not
  // apply to deliberately incomplete snippets used to exercise diagnostics.
  configuration.linter.rules = { recommended: false };
  configuration.overrides = [];
  writeFileSync(
    resolve(directory, 'biome.json'),
    JSON.stringify(configuration),
  );
});
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('Biome Grit persistence lifecycle plugin', () => {
  it.each([valid, current])(
    'accepts a valid lifecycle, including production generic decorators',
    (source) => {
      expect(lint(source)).toMatchObject({ status: 0 });
    },
  );

  it.each(['Cache', 'AcknowledgePersisted', 'MapPersistenceErrors'])(
    'rejects missing @%s',
    (name) => {
      const result = lint(
        valid.replace(new RegExp(`  @${name}\\([^)]*\\)\\n`), ''),
      );
      expect(result.status).toBe(1);
      expect(result.diagnostics).toContain('Persistence lifecycle requires');
    },
  );

  it('rejects wrong order and duplicate decorators', () => {
    for (const source of [
      valid.replace(
        '@Cache(key)\n  @AcknowledgePersisted(options)',
        '@AcknowledgePersisted(options)\n  @Cache(key)',
      ),
      valid.replace('@Cache(key)', '@Cache(key)\n  @Cache(key)'),
    ]) {
      expect(lint(source).diagnostics).toContain(
        'Persistence lifecycle requires',
      );
    }
  });

  it('accepts @PersistedWrite as the whole lifecycle', () => {
    const source = valid
      .replace(
        '@Cache(key)\n  @AcknowledgePersisted(options)\n  @MapPersistenceErrors(options)',
        '@PersistedWrite<Role>(options)',
      )
      .replace(
        'Cache, AcknowledgePersisted, MapPersistenceErrors,',
        'PersistedWrite,',
      );
    expect(lint(source)).toMatchObject({ status: 0 });
  });

  it.each(['Cache', 'AcknowledgePersisted', 'MapPersistenceErrors'])(
    'rejects @PersistedWrite combined with @%s',
    (name) => {
      const source = valid.replace(
        '@Cache(key)\n  @AcknowledgePersisted(options)\n  @MapPersistenceErrors(options)',
        `@PersistedWrite(options)\n  @${name}(options)`,
      );
      const result = lint(source);
      expect(result.status).toBe(1);
      expect(result.diagnostics).toContain('do not combine it with them');
    },
  );

  it('rejects a missing helper and a second unawaited write even when one write is awaited', () => {
    expect(
      lint(
        valid.replace(
          "await optimisticUpdate(em, Role, role, data, 'Role');",
          '',
        ),
      ).diagnostics,
    ).toContain('must await optimisticUpdate');
    expect(
      lint(
        valid.replace(
          'return role;',
          "optimisticUpdate(em, Role, role, data, 'Role'); return role;",
        ),
      ).diagnostics,
    ).toContain('Await optimisticUpdate()');
  });

  it.each(['acknowledgePersisted'])('rejects manual %s', (method) => {
    expect(
      lint(valid.replace('return role;', `role.${method}(2); return role;`))
        .diagnostics,
    ).toContain('instead of manual acknowledgment');
  });

  it('rejects removal of the migrated save method', () => {
    expect(lint('class UpdateRoleCommandRepository {}').diagnostics).toContain(
      'must declare its decorated save',
    );
    expect(lint('class UpdateOrderCommandRepository {}').diagnostics).toContain(
      'must declare its decorated save',
    );
  });

  it('checks helper consumers in other class methods', () => {
    const source = valid
      .replace('UpdateRoleCommandRepository', 'OtherRepository')
      .replace('async save', 'async update')
      .replace('@AcknowledgePersisted(options)', '');
    expect(lint(source).diagnostics).toContain(
      'Persistence lifecycle requires',
    );
  });

  it('rejects API aliases rather than silently bypassing name-based checks', () => {
    const source = valid
      .replace('optimisticUpdate }', 'optimisticUpdate as write }')
      .replace('await optimisticUpdate(', 'await write(');
    expect(lint(source).diagnostics).toContain(
      'canonical persistence API names',
    );
  });

  it('leaves unrelated repositories and helper text in comments alone', () => {
    expect(
      lint(
        'class LegacyRepository { /* optimisticUpdate() */ async save() {} }',
      ).status,
    ).toBe(0);
  });

  it('rejects hand-rolled error translation inside a command repository save()', () => {
    // A try/catch here runs inside the write boundary, so its ordering relative
    // to @AcknowledgePersisted and @Cache stops being expressed by the decorator
    // stack. Constraint mapping belongs in @MapPersistenceErrors, and transient
    // classification in its `otherwise` translator.
    const source = `
class DeleteUserCommandRepository {
  async save(user) {
    try {
      return await this.store.em.nativeDelete(User, { id: user.id });
    } catch (error) {
      throw mapPersistenceError(error, 'deleting User');
    }
  }
}`;
    const result = lint(source);
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'Do not hand-roll error translation inside save()',
    );
  });

  it('allows try/catch outside save(), such as load-path error translation', () => {
    const source = `
class DeleteUserCommandRepository {
  async findById(id) {
    try {
      return await this.store.em.findOne(User, { id }, { refresh: true });
    } catch (error) {
      throw mapPersistenceError(error, 'loading User');
    }
  }
  async save(user) { return null; }
}`;
    expect(lint(source).status).toBe(0);
  });
});
