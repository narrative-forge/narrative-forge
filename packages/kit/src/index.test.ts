import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@forge/kit', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@forge/kit');
  });
});
