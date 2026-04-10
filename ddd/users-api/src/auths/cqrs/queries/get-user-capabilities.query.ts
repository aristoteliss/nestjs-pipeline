import { createQuery } from '@common/cqrs/helpers/createQuery.helper';
import { z } from 'zod';

export class GetUserCapabilitiesQuery extends createQuery(
  z.object({
    userId: z.union([z.string().min(1), z.number()]),
  }),
) {}
