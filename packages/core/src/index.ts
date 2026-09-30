/**
 * @forge/core — public API.
 *
 * Domain logic for Narrative Forge: rhythm scheduling (buildSchedule /
 * locate) and the frame→progress mapping consumed by the Remotion render
 * layer (frameToProgress).
 */

export { buildSchedule, locate } from './schedule';
export type { Schedule, ScheduleOptions, ScheduleSegment, LocateResult } from './schedule';
export { frameToProgress } from './frame';
