import { z } from 'zod';
import { createRequest } from '../helpers/createRequest.helper';

const schema = z.object({
  userId: z.uuid(),
  username: z.string().min(1),
});

export class UserUpdatedEvent extends createRequest(schema) {}
