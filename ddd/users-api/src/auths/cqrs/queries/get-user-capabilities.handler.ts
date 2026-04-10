import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { UserCapabilities } from '@nestjs-pipeline/casl';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { QUERY_REPOSITORY } from '../../repositories/repository.tokens';
import { GetUserCapabilitiesQuery } from './get-user-capabilities.query';

@QueryHandler(GetUserCapabilitiesQuery)
export class GetUserCapabilitiesHandler
  implements IQueryHandler<GetUserCapabilitiesQuery, UserCapabilities>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getUserCapabilities)
    private readonly queryRepository: IQueryRepository<
      GetUserCapabilitiesQuery,
      UserCapabilities
    >,
  ) {}

  async execute(query: GetUserCapabilitiesQuery): Promise<UserCapabilities> {
    return await this.queryRepository.find(query);
  }
}
