import { uuidv7 } from '@nestjs-pipeline/core';

export abstract class DomainEvent {
  public readonly id: string;

  protected constructor(id?: string) {
    this.id = id ?? uuidv7();
  }
}
