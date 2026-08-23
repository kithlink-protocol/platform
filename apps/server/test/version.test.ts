import { describe, expect, it } from 'vitest';
import { getVersion } from '../src/common/version';

describe('getVersion', () => {
  it('resolves the root manifest and caches the result', () => {
    const first = getVersion();
    expect(first.name).toBe('kithlink');
    expect(first.version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    expect(getVersion()).toBe(first);
  });
});
