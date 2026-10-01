/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { loadOptionalEnvFile } from '@common/environment/load-optional-env-file.js';
import { migrate } from './migrate.js';
import { purgeSessions } from './purge-sessions.js';
import { rebuildUserPermissions } from './rebuild-user-permissions.js';
import { revert } from './revert.js';
import { verifyUserPermissions } from './verify-user-permissions.js';

/**
 * The persistence maintenance commands, run as
 * `tsx src/persistence/cli.ts <command> [args]` by the package scripts.
 */
const commands: Record<string, (args: string[]) => Promise<void>> = {
  async migrate() {
    const applied = await migrate();
    console.log(
      applied > 0
        ? `Done - ${applied} migration(s) applied.`
        : 'Already up to date.',
    );
  },

  async revert(args) {
    const reverted = await revert(steps(args));
    console.log(
      reverted > 0
        ? `Done - ${reverted} migration(s) reverted.`
        : 'Nothing to revert.',
    );
  },

  async 'sessions:purge'() {
    for (const [tenant, count] of await purgeSessions()) {
      console.log(`${tenant}: purged ${count} session(s).`);
    }
  },

  async 'permissions:rebuild'() {
    for (const [tenant, count] of await rebuildUserPermissions()) {
      console.log(`${tenant}: rebuilt permission rules for ${count} user(s).`);
    }
  },

  async 'permissions:verify'() {
    let drifted = 0;
    for (const [tenant, userIds] of await verifyUserPermissions()) {
      drifted += userIds.length;
      console.log(
        userIds.length === 0
          ? `${tenant}: no drift.`
          : `${tenant}: drifted user(s): ${userIds.join(', ')}`,
      );
    }
    process.exitCode = drifted > 0 ? 1 : 0;
  },
};

/**
 * The revert step count: `--steps=N`, `--steps N` or a bare `N`; 1 when none
 * is given.
 *
 * @throws {Error} When `--steps` is not a positive integer.
 */
function steps(args: string[]): number {
  const inline = args.find((arg) => arg.startsWith('--steps='));
  const flag = args.indexOf('--steps');
  const raw =
    inline?.slice('--steps='.length) ??
    (flag >= 0
      ? (args[flag + 1] ?? '')
      : args.find((arg) => /^\d+$/.test(arg)));
  if (raw === undefined) return 1;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('--steps must be a positive integer.');
  }
  return value;
}

const [name = '', ...args] = process.argv.slice(2);
const command = commands[name];
if (!command) {
  console.error(
    `Unknown command "${name}". Commands: ${Object.keys(commands).join(', ')}.`,
  );
  process.exitCode = 1;
} else {
  loadOptionalEnvFile();
  command(args).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
