import { z } from 'zod';
import { createRequest } from '../helpers/createRequest.helper';

export class GetUsersQuery extends createRequest(z.object({})) {}
