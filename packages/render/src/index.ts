/**
 * @forge/render — public API.
 *
 * `renderStory` is the whole pipeline; `loadStory` is exported separately so
 * `@forge/cli` can validate a story *before* it commits to starting a Studio
 * or a render (CLI5).
 */

export const PACKAGE_NAME = '@forge/render';
export { loadStory } from './loadStory.js';
export { renderStory } from './render.js';
export type { RenderOptions, RenderResult } from './types.js';
