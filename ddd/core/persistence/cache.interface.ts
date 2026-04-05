export interface ICache<T = unknown> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, options?: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}
