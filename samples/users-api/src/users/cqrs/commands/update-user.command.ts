import { z } from 'zod';
import { createRequest } from '../helpers/createRequest.helper';

const schema = z.object({
  id: z.uuid(),
  username: z.string().min(5),
});

export interface UpdateUserCommand extends z.infer<typeof schema> {}

export class UpdateUserCommand extends createRequest(schema) {}
