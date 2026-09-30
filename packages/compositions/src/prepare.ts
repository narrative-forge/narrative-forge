import { buildSchedule } from '@forge/core';
import type { Schedule } from '@forge/core';
/**
 * @forge/compositions — story → composition props.
 *
 * Pure preparation step (per the TASK-007 performance contract, the schedule
 * is built **here**, never inside the render component, so each frame only
 * pays for layout math — not scheduling).
 */
import type { Story } from '@forge/schema';

export interface TimelineCompositionProps {
  story: Story;
  viewId: string;
  schedule: Schedule;
  width: number;
  height: number;
  durationInFrames: number;
  fps: number;
}

/**
 * Resolve the timeline composition props for a given `viewId`.
 *
 * Steps: find the view → validate it is a `timeline` view → build the rhythm
 * schedule from `story.nodes` → derive `durationInFrames` from the schedule
 * total and `fps` → read canvas dimensions from `meta.resolution`.
 *
 * Note on duration (P3/P4): the rhythm schedule is the source of truth for
 * playback length, so `durationInFrames = ceil(schedule.totalSec * fps)`. The
 * invariant P3 is therefore verified as *consistency* between `totalSec` and
 * the effective duration `durationInFrames / fps` (|Δ| < 1s). The demo's
 * `view.duration` (30s) is intentionally NOT used to truncate the schedule —
 * see TASK-007-report §6 for the deviation rationale.
 */
export function prepareTimelineProps(
  story: Story,
  viewId: string,
  fps: number
): TimelineCompositionProps {
  const view = story.views.find((candidate) => candidate.id === viewId);
  if (!view) {
    throw new Error(`view "${viewId}" not found in story "${story.meta.title}"`);
  }
  const viewType: string = view.type;
  if (viewType !== 'timeline') {
    throw new Error(`view "${viewId}" has type "${view.type}", expected "timeline"`);
  }

  const schedule = buildSchedule(story.nodes);
  const durationInFrames = Math.ceil(schedule.totalSec * fps);

  const resolutionParts = story.meta.resolution.split('x');
  const parsedWidth = Number(resolutionParts[0]);
  const parsedHeight = Number(resolutionParts[1]);
  const width = Number.isFinite(parsedWidth) ? parsedWidth : 1920;
  const height = Number.isFinite(parsedHeight) ? parsedHeight : 1080;

  return {
    story,
    viewId,
    schedule,
    width,
    height,
    durationInFrames,
    fps,
  };
}
