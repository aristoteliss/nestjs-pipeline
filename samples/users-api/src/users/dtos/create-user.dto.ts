import { z } from 'zod';

export const CreateUserDtoSchema = z.object({
  email: z.email(),
  name: z.string().min(5),
});

export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;