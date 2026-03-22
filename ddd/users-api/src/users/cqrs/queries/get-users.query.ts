import { z } from 'zod';
import { createQuery } from '../helpers/createQuery.helper';

export class GetUsersQuery extends createQuery(z.object({})) {}
