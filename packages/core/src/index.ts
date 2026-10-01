/**
 * @forge/core — public API.
 *
 * Domain logic for Narrative Forge: rhythm scheduling (buildSchedule /
 * locate) and the frame→progress mapping consumed by the Remotion render
 * layer (frameToProgress).
 */

export { buildSchedule, locate } from './schedule.js';
export type { LocateResult, Schedule, ScheduleOptions, ScheduleSegment } from './schedule.js';
export { frameToProgress } from './frame.js';
