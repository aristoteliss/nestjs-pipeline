import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadOptionalEnvFile } from './load-optional-env-file';

describe('loadOptionalEnvFile', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ignores a missing env file', () => {
    const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
    vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {
      throw error;
    });

    expect(() => loadOptionalEnvFile()).not.toThrow();
  });

  it('preserves non-missing-file errors', () => {
    const error = Object.assign(new Error('denied'), { code: 'EACCES' });
    vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {
      throw error;
    });

    expect(() => loadOptionalEnvFile()).toThrow(error);
  });
});
