import { EventBus, type ICommand, type ICommandHandler } from '@nestjs/cqrs';
import { DomainOutcome } from '../domain/outcomes/domain.outcome';

export abstract class CommandBaseHandler<
  TCommand extends ICommand = ICommand,
  TResult = DomainOutcome,
> implements ICommandHandler<ICommand, TResult>
{
  protected constructor(protected eventBus: EventBus) {}

  abstract handle(command: TCommand): Promise<TResult>;

  async execute(command: ICommand): Promise<TResult> {
    const commandResult = await this.handle(command as TCommand);

    if (commandResult instanceof DomainOutcome) {
      this.eventBus.publishAll(commandResult.events);
    }

    return commandResult;
  }
}
