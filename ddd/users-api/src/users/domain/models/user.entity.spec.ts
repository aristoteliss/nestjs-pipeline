import { describe, expect, it } from 'vitest';
import { User } from './user.entity';

describe('User update', () => {
  it('rejects a domain-level no-op without changing updatedAt', () => {
    const user = User.create('Alice', 'alice@example.test').entity;
    const before = user.updatedAt;

    expect(() => user.update({})).toThrow('At least one user field');
    expect(user.updatedAt.getTime()).toBe(before.getTime());
  });
});
