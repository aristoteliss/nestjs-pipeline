import { EventBus, type ICommand, type ICommandHandler } from '@nestjs/cqrs';
import { DomainOutcome } from '../domain/outcomes/domain.outcome';

export abstract class CommandBaseHandler<
  TCommand extends ICommand = ICommand,
  TResult extends DomainOutcome = DomainOutcome,
> implements ICommandHandler<ICommand, TResult>
{
  protected constructor(protected eventBus: EventBus) {}

  abstract handle(command: TCommand): Promise<TResult>;

  async execute(command: ICommand): Promise<TResult> {
    const commandResult = await this.handle(command as TCommand);

    this.eventBus.publishAll(commandResult.events);

    return commandResult;
  }
}
