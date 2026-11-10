import { describe, expect, it } from 'vitest';

import {
  createRewardPreviews,
  REWARD_PREVIEW_HEIGHT,
  REWARD_PREVIEW_WIDTH,
} from '../../src/domain/collection/journey';
import type {
  RewardCanvas,
  RewardCanvasContext,
  RewardImageSource,
  RewardPreviewCard,
} from '../../src/domain/collection/journey';

type DrawCall = [RewardImageSource, number, number, number, number];

function fallbackCanvas(): RewardCanvas {
  return {
    width: 0,
    height: 0,
    setAttribute() {},
    getContext() {
      return null;
    },
  };
}

function setup(available = true, canvasWorks = true) {
  const draws: DrawCall[] = [];
  const canvases: RewardCanvas[] = [];
  const releases: RewardCanvas[] = [];
  const source: RewardImageSource = { naturalWidth: 600, naturalHeight: 825 };
  let downloads = 0;

  const previews = createRewardPreviews<RewardCanvas>({
    createCanvas() {
      const canvas: RewardCanvas = {
        width: 0,
        height: 0,
        setAttribute() {},
        getContext(): RewardCanvasContext | null {
          if (!canvasWorks) return null;
          return {
            drawImage(image, dx, dy, width, height) {
              draws.push([image, dx, dy, width, height]);
            },
          };
        },
      };
      canvases.push(canvas);
      return canvas;
    },
    keyOf: (card: RewardPreviewCard) => card.card,
    readyImage: () => (available ? source : null),
    fallbackThumbnail: () => {
      downloads++;
      return fallbackCanvas();
    },
    releaseImage: (image) => releases.push(image),
  });

  return {
    previews,
    draws,
    source,
    canvases,
    releases,
    get downloads() {
      return downloads;
    },
  };
}

describe('reward preview', () => {
  it('completion preview copies ready exact artwork once without download or decode', () => {
    const harness = setup();
    const card: RewardPreviewCard = { card: 'exact', name: 'A' };

    const preview = harness.previews.get(card);
    expect(harness.previews.get(card)).toBe(preview);
    expect(preview.width).toBe(REWARD_PREVIEW_WIDTH);
    expect(preview.height).toBe(REWARD_PREVIEW_HEIGHT);
    expect(harness.downloads).toBe(0);
    expect(harness.draws).toHaveLength(1);

    const draw = harness.draws[0];
    expect(draw?.[0]).toBe(harness.source);
    if (draw) {
      expect(Math.abs(draw[3] / draw[4] - 600 / 825)).toBeLessThan(0.00001);
    }
  });

  it('tiny preview cache is bounded and print changes produce a fresh snapshot', () => {
    const harness = setup();
    for (let index = 0; index < 50; index++) {
      harness.previews.get({ card: String(index), name: 'A' });
    }

    expect(harness.previews.size).toBe(30);
    expect(harness.draws).toHaveLength(50);
    expect(harness.previews.has({ card: '0' })).toBe(false);
    expect(harness.previews.has({ card: '49' })).toBe(true);
    expect(harness.releases).toHaveLength(20);
  });

  it('missing decoded source or unavailable canvas retains normal thumbnail loading', () => {
    for (const [available, canvasWorks] of [
      [false, true],
      [true, false],
    ] as const) {
      const harness = setup(available, canvasWorks);
      harness.previews.get({ card: 'a' });
      expect(harness.downloads).toBe(1);
      expect(harness.draws).toHaveLength(0);
    }
  });
});
