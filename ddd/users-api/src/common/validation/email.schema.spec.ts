import { describe, expect, it } from 'vitest';
import { CreateAuthCommand } from '../../auths/cqrs/commands/create-auth.command';
import { LoginDtoSchema } from '../../auths/dtos/login.dto';
import { CreateUserCommand } from '../../users/cqrs/commands/create-user.command';

describe('EmailSchema consumers', () => {
  it('canonicalizes registration and login emails identically', () => {
    const input = '  User@Example.COM ';

    expect(
      new CreateUserCommand({
        username: 'Alice',
        email: input,
      }).email,
    ).toBe('user@example.com');
    expect(LoginDtoSchema.parse({ email: input, code: '1234' }).email).toBe(
      'user@example.com',
    );
    expect(new CreateAuthCommand({ email: input, code: '1234' }).email).toBe(
      'user@example.com',
    );
  });
});
