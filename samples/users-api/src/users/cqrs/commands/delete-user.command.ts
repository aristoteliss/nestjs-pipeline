import { z } from 'zod';
import { createRequest } from '../helpers/createRequest.helper';

const schema = z.object({
  id: z.uuid(),
});

export interface DeleteUserCommand extends z.infer<typeof schema> {}

export class DeleteUserCommand extends createRequest(schema) {}

