import { describe, test, expect } from 'bun:test';
import { invariant, sleep } from './index';

describe('invariant()', () => {
  describe('truthy conditions - should pass', () => {
    test('passes with true boolean', () => {
      // Arrange & Act & Assert - no throw
      expect(() => invariant(true)).not.toThrow();
    });

    test('passes with truthy string', () => {
      expect(() => invariant('non-empty string')).not.toThrow();
    });

    test('passes with truthy number', () => {
      expect(() => invariant(1)).not.toThrow();
      expect(() => invariant(-1)).not.toThrow();
      expect(() => invariant(0.1)).not.toThrow();
    });

    test('passes with object', () => {
      expect(() => invariant({})).not.toThrow();
      expect(() => invariant({ key: 'value' })).not.toThrow();
    });

    test('passes with array', () => {
      expect(() => invariant([])).not.toThrow();
      expect(() => invariant([1, 2, 3])).not.toThrow();
    });

    test('passes with function', () => {
      expect(() => invariant(() => {})).not.toThrow();
    });
  });

  describe('falsy conditions - should throw', () => {
    test('throws with false boolean', () => {
      expect(() => invariant(false)).toThrow();
    });

    test('throws with null', () => {
      expect(() => invariant(null)).toThrow();
    });

    test('throws with undefined', () => {
      expect(() => invariant(undefined)).toThrow();
    });

    test('throws with zero', () => {
      expect(() => invariant(0)).toThrow();
    });

    test('throws with empty string', () => {
      expect(() => invariant('')).toThrow();
    });

    test('throws with NaN', () => {
      expect(() => invariant(Number.NaN)).toThrow();
    });
  });

  describe('error messages', () => {
    test('throws with default message when none provided', () => {
      expect(() => invariant(false)).toThrow('Invariant failed');
    });

    test('throws with custom message', () => {
      const customMessage = 'Expected user to be authenticated';
      expect(() => invariant(false, customMessage)).toThrow(customMessage);
    });

    test('throws Error instance', () => {
      try {
        invariant(false, 'test message');
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('test message');
      }
    });
  });

  describe('type narrowing', () => {
    test('narrows type after passing', () => {
      const value: string | null = 'hello';

      invariant(value !== null, 'value should not be null');

      // If this compiles, type narrowing works
      const result: string = value;
      expect(result).toBe('hello');
    });

    test('works with optional chaining pattern', () => {
      const obj: { user?: { name: string } } = { user: { name: 'Alice' } };

      invariant(obj.user, 'User required');

      // Type is narrowed - user is no longer optional
      expect(obj.user.name).toBe('Alice');
    });
  });
});

describe('sleep()', () => {
  test('returns a Promise', () => {
    const result = sleep(1);
    expect(result).toBeInstanceOf(Promise);
  });

  test('resolves after approximately the specified time', async () => {
    const start = performance.now();
    await sleep(50);
    const elapsed = performance.now() - start;

    // Allow some tolerance for timing
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(100);
  });

  test('resolves with undefined', async () => {
    const result = await sleep(1);
    expect(result).toBeUndefined();
  });

  test('can be used with Promise.all', async () => {
    const start = performance.now();
    await Promise.all([sleep(20), sleep(20), sleep(20)]);
    const elapsed = performance.now() - start;

    // All should run concurrently, so total time ~ 20ms, not 60ms
    expect(elapsed).toBeLessThan(50);
  });
});
