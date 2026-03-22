import { z } from 'zod';
import { createQuery } from '../helpers/createQuery.helper';

export class GetUserQuery extends createQuery(
  z.object({
    userId: z.uuid(),
  }),
) {}
