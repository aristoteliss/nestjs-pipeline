import { z } from 'zod';

export const UserIdDtoSchema = z.string().uuid();

export type UserIdDto = z.infer<typeof UserIdDtoSchema>; // = string