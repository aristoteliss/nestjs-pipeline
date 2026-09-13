import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const applicationFiles = [
  '../../auths/cqrs/commands/create-auth.handler.ts',
  '../../auths/infrastructure/jose-access-token.issuer.ts',
  '../../auths/services/jwt-authenticator.ts',
  '../../auths/services/api-client-authenticator.ts',
  '../../auths/services/request-principal-resolver.ts',
  '../../users/cqrs/events/user-created.handler.ts',
  '../../users/cqrs/events/user-updated.handler.ts',
] as const;

/** Architecture regression for Architecture.md finding #3. */
describe('application tenant-context boundary', () => {
  it.each(applicationFiles)(
    '%s depends on the neutral tenant-context port, not persistence',
    (relativePath) => {
      const source = readFileSync(resolve(__dirname, relativePath), 'utf8');

      expect(source).not.toContain('@persistence/tenant-schema.context');
      expect(source).not.toContain('../../persistence/tenant-schema.context');
      expect(source).toContain('TENANT_CONTEXT');
    },
  );

  it('user-login.service.ts does not depend on persistence tenant context', () => {
    const source = readFileSync(
      resolve(__dirname, '../../auths/services/user-login.service.ts'),
      'utf8',
    );
    expect(source).not.toContain('@persistence/tenant-schema.context');
    expect(source).not.toContain('../../persistence/tenant-schema.context');
  });
});
