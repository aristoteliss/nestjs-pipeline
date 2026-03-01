import { InternalServerErrorException } from '@nestjs/common';
import { z } from 'zod';
import { User } from '../domain/user.entity';

export const UserResponseDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
}).transform(({ id, email, username }) => ({ id, email, name: username }));

export type UserResponseDto = z.output<typeof UserResponseDtoSchema>;

export function toResponseDto(user: User): UserResponseDto {
  const result = UserResponseDtoSchema.safeParse(user.toSnapshot());
  if (!result.success) throw new InternalServerErrorException('Response mapping failed');
  return result.data;
}