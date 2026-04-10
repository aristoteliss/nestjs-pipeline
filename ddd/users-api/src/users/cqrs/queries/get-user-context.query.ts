import { createQuery } from '@common/cqrs/helpers/createQuery.helper';
import { z } from 'zod';

export class GetUserContextQuery extends createQuery(
  z.object({
    userId: z.string().min(1),
  }),
) {}
