import { createQuery } from '@common/cqrs/helpers/createQuery.helper';
import { z } from 'zod';

export class GetUsersQuery extends createQuery(z.object({})) {}
