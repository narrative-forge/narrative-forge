import type { Story } from '@forge/schema';
import type { ComponentType, FC } from 'react';
import { Composition } from 'remotion';
import huiningStory from '../../../stories/demo/huining-1936.json';
import { TimelineComposition } from './TimelineComposition.js';
import { TIMELINE_COMPOSITION_ID, prepareTimelineProps } from './prepare.js';

/** Remotion 根：注册会宁会师时间线 composition。 */
export const RemotionRoot: FC = () => {
  const props = prepareTimelineProps(huiningStory as unknown as Story, 'main-timeline', 30);
  return (
    <Composition
      id={TIMELINE_COMPOSITION_ID}
      // Remotion's <Composition> expects a loosely-typed component
      // (LooseComponentType<Record<string, unknown>>); the concrete props are
      // supplied via `defaultProps` (typed TimelineCompositionProps above).
      component={TimelineComposition as unknown as ComponentType<Record<string, unknown>>}
      durationInFrames={props.durationInFrames}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={props}
    />
  );
};
