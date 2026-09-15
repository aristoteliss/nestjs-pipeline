/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Load a local env file when present while preserving all other failures. */
export function loadOptionalEnvFile(path?: string): void {
  try {
    process.loadEnvFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
