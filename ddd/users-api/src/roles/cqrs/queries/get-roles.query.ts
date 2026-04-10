import { createQuery } from '@common/cqrs/helpers/createQuery.helper';
import { z } from 'zod';

export class GetRolesQuery extends createQuery(z.object({})) {}
