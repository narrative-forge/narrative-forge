import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('@forge/cli', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@forge/cli');
  });
});
