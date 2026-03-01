
import { z } from 'zod';

export const UpdateUserDtoSchema = z.object({
  name: z.string().min(5),
});

export type UpdateUserDto = z.infer<typeof UpdateUserDtoSchema>;