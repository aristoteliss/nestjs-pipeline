export abstract class QueryOptions {
  public cacheKey?: string;

  constructor(cacheKey?: string) {
    this.cacheKey = cacheKey;
  }
}
