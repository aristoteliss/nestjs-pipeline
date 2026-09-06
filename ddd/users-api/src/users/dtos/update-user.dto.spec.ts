import { describe, expect, it } from 'vitest';
import { UpdateUserDtoSchema } from './update-user.dto';

describe('UpdateUserDtoSchema', () => {
  it('rejects an empty update', () => {
    expect(UpdateUserDtoSchema.safeParse({}).success).toBe(false);
  });

  it('accepts each mutable field independently', () => {
    expect(UpdateUserDtoSchema.safeParse({ name: 'Alice' }).success).toBe(true);
    expect(UpdateUserDtoSchema.safeParse({ department: null }).success).toBe(
      true,
    );
  });
});
