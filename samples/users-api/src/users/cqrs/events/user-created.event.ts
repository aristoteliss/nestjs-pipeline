import { z } from 'zod';
import { createRequest } from '../helpers/createRequest.helper';

const schema = z.object({
  userId: z.uuid(),
  username: z.string().min(1),
  email: z.email(),
});

export interface UserCreatedEvent extends z.infer<typeof schema> {}

export class UserCreatedEvent extends createRequest(schema) {}
