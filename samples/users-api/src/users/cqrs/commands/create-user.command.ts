import { z } from 'zod';
import { createRequest } from '../helpers/createRequest.helper';

const schema = z.object({
  username: z.string().min(4),
  email: z.email(),
});

export interface CreateUserCommand extends z.infer<typeof schema> {}

export class CreateUserCommand extends createRequest(schema) {}