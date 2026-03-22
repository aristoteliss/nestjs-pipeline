import { z } from 'zod';
import { createRequest } from '../helpers/createRequest.helper';

export class GetUserQuery extends createRequest(
  z.object({
    userId: z.uuid(),
  }),
) {}
