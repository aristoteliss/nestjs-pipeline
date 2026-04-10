import { createQuery } from '@common/cqrs/helpers/createQuery.helper';
import { z } from 'zod';

export class GetRolesCapabilitiesQuery extends createQuery(
  z.object({
    names: z.array(z.string().min(1)).optional(),
  }),
) {}
