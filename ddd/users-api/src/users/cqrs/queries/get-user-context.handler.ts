import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { CaslUserContext } from '@nestjs-pipeline/casl';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { QUERY_REPOSITORY } from '../../repositories/repository.tokens';
import { GetUserContextQuery } from './get-user-context.query';

@QueryHandler(GetUserContextQuery)
export class GetUserContextHandler
  implements IQueryHandler<GetUserContextQuery, CaslUserContext | null>
{
  constructor(
    @Inject(QUERY_REPOSITORY.getUserContext)
    private readonly queryRepository: IQueryRepository<
      GetUserContextQuery,
      CaslUserContext | null
    >,
  ) {}

  async execute(query: GetUserContextQuery): Promise<CaslUserContext | null> {
    return await this.queryRepository.find(query);
  }
}
