export abstract class QueryOptions {
  readonly hydrate: boolean;

  constructor(options?: Partial<QueryOptions>) {
    this.hydrate = options?.hydrate ?? true;
  }
}
