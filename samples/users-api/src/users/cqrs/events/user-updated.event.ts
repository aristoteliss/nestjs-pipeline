import { z } from 'zod';
import { createRequest } from '../helpers/createRequest.helper';

const schema = z.object({
  userId: z.uuid(),
  username: z.string().min(1),
});

export interface UserUpdatedEvent extends z.infer<typeof schema> {}

export class UserUpdatedEvent extends createRequest(schema) {}
