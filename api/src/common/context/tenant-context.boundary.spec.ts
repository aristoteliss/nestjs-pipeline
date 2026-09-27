/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const applicationFiles = [
  '../../auths/application/cqrs/commands/create-auth.handler.ts',
  '../../auths/infrastructure/jose-access-token.issuer.ts',
  '../../auths/services/jwt-authenticator.ts',
  '../../auths/services/api-client-authenticator.ts',
  '../../auths/services/request-principal-resolver.ts',
  '../../users/application/cqrs/events/user-created.handler.ts',
  '../../users/application/cqrs/events/user-updated.handler.ts',
] as const;

function readSource(relativePath: string): string {
  const fullPath = resolve(__dirname, relativePath);
  if (existsSync(fullPath)) return readFileSync(fullPath, 'utf8');
  const alternate = fullPath.includes('/cqrs/')
    ? fullPath.replace('/cqrs/', '/application/cqrs/')
    : fullPath.replace('/application/cqrs/', '/cqrs/');
  if (existsSync(alternate)) return readFileSync(alternate, 'utf8');
  return readFileSync(fullPath, 'utf8');
}

/** Architecture regression for Architecture.md finding #3. */
describe('application tenant-context boundary', () => {
  it.each(applicationFiles)(
    '%s depends on the neutral tenant-context port, not persistence',
    (relativePath) => {
      const source = readSource(relativePath);

      expect(source).not.toContain('@persistence/tenant-schema.context');
      expect(source).not.toContain('../../persistence/tenant-schema.context');
      expect(source).toContain('TENANT_CONTEXT');
    },
  );

  it('user-login.service.ts does not depend on persistence tenant context', () => {
    const source = readSource('../../auths/services/user-login.service.ts');
    expect(source).not.toContain('@persistence/tenant-schema.context');
    expect(source).not.toContain('../../persistence/tenant-schema.context');
  });
});
