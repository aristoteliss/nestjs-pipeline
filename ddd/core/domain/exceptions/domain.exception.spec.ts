import { describe, expect, it } from 'vitest';
import { DomainException } from './domain.exception';

class SampleDomainException extends DomainException {
  constructor(message = 'Sample error') {
    super(message);
  }
}

describe('DomainException', () => {
  it('instantiates and preserves error prototype and name', () => {
    const error = new SampleDomainException('Domain invariant violation');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainException);
    expect(error).toBeInstanceOf(SampleDomainException);
    expect(error.name).toBe('SampleDomainException');
    expect(error.message).toBe('Domain invariant violation');
  });
});
