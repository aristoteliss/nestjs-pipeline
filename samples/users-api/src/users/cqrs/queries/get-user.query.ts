import { z } from 'zod';
import { createRequest } from '../helpers/createRequest.helper';

export const GetUserQuerySchema = z.object({
  userId: z.uuid(),
});

export interface GetUserQuery extends z.infer<typeof GetUserQuerySchema> {}
export class GetUserQuery extends createRequest(GetUserQuerySchema) {}
