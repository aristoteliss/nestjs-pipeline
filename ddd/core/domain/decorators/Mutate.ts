import { Method } from '../../types/Method.type';

export function Mutate(): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const original = descriptor.value as Method;

    descriptor.value = function (...args: unknown[]): unknown {
      const result = original.apply(this, args);
      const entity = this as { onUpdate?: () => void };

      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>).then((value) => {
          entity.onUpdate?.();
          return value;
        });
      }

      entity.onUpdate?.();
      return result;
    };

    return descriptor;
  };
}
