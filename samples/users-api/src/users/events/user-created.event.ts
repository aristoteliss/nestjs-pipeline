export class UserCreatedEvent {
  constructor(
    public readonly userId: string,
    public readonly name: string,
    public readonly email: string,
  ) {}
}
