import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { landscapeTickerSharedCrossingVertex } from '../helpers/landscapeTickerCrossingFixture';
import {
  assertDominantCrossingPixel,
  assertStoredProofMatchesImage,
  evidenceDir,
  persistCrossingProof,
  writeEvidenceJson,
} from '../helpers/landscapeTickerEvidence';
import { mountLandscapeTicker } from '../helpers/mountLandscapeTickerPage';

const SHARED = landscapeTickerSharedCrossingVertex();

test.describe('landscape ticker live-phase coincident vertex', () => {
  test('Blitz/Daily shared vertex ownership across hero live, settled, quiet, and competing reselect', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { crossing: true, viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);

    const chart = page.getByTestId('landscape-ticker-chart');
    const vertex = {
      kind: 'exact-shared-vertex' as const,
      occurredAt: SHARED.occurredAt,
      ratingAfter: SHARED.ratingAfter,
      pointIds: SHARED.ids,
    };

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('landscape-ticker-category-daily').click();
    await page.clock.fastForward(700);

    await expect(page.getByTestId('landscape-ticker-path-free_day')).toHaveAttribute(
      'data-reveal-phase',
      'hero',
    );
    const heroLive = await assertDominantCrossingPixel(page, 'free_day', 0, {
      mode: 'live',
      liveAtMs: 700,
      clipSlug: 'hero-live-shared-vertex',
      pointId: 'x-dy-2',
    });
    expect(heroLive.captureMode).toBe('live');
    expect(heroLive.coincidenceKind).toBe('exact-shared-vertex');
    expect(heroLive.animation.invokedFinish).toBe(false);
    expect(heroLive.animation.nonterminal).toBe(true);
    expect(heroLive.animation.seekCurrentTimeMs).toBe(700);
    expect(heroLive.probe.zIndex).toBe('2');

    const heroSettled = await assertDominantCrossingPixel(page, 'free_day', 0, {
      mode: 'settled',
      clipSlug: 'hero-settled-shared-vertex',
      pointId: 'x-dy-2',
    });
    expect(heroSettled.captureMode).toBe('settled');
    expect(heroSettled.animation.invokedFinish).toBe(true);
    expect(heroSettled.animation.finishFailures).toEqual([]);
    expect(heroSettled.animation.settlementMethod).toBe('animation.finish()');
    await page.clock.fastForward(1100);
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_day');
    await expect(page.getByTestId('landscape-ticker-path-free_day')).toHaveAttribute(
      'data-reveal-phase',
      'settled',
    );

    await page.getByTestId('landscape-ticker-category-daily').click();
    await page.getByTestId('landscape-ticker-category-daily').click();
    await page.clock.fastForward(200);
    await expect(page.getByTestId('landscape-ticker-path-free_day')).toHaveAttribute(
      'data-reveal-phase',
      'quiet',
    );
    const quietLive = await assertDominantCrossingPixel(page, 'free_day', 0, {
      mode: 'live',
      liveAtMs: 200,
      clipSlug: 'quiet-live-shared-vertex',
      pointId: 'x-dy-2',
    });
    expect(quietLive.captureMode).toBe('live');
    expect(quietLive.animation.invokedFinish).toBe(false);
    expect(quietLive.animation.nonterminal).toBe(true);
    expect(quietLive.animation.seekCurrentTimeMs).toBe(200);

    const quietSettled = await assertDominantCrossingPixel(page, 'free_day', 0, {
      mode: 'settled',
      clipSlug: 'quiet-settled-shared-vertex',
      pointId: 'x-dy-2',
    });
    expect(quietSettled.captureMode).toBe('settled');
    expect(quietSettled.animation.invokedFinish).toBe(true);
    await page.clock.fastForward(280);
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_day');

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(500);
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');
    const competingSettled = await assertDominantCrossingPixel(page, 'free_blitz', 0, {
      mode: 'settled',
      clipSlug: 'competing-reselected-settled-shared-vertex',
      pointId: 'x-bz-2',
    });
    expect(competingSettled.captureMode).toBe('settled');
    expect(competingSettled.coincidenceKind).toBe('exact-shared-vertex');
    expect(competingSettled.probe.owner).toBe('landscape-ticker-path-free_blitz');
    expect(competingSettled.probe.zIndex).toBe('2');

    const rows = [
      {
        file: 'crossing-proof-hero-live-shared-vertex.json',
        proof: persistCrossingProof('hero live at Blitz/Daily shared vertex', heroLive, {
          sequenceStep: 'Daily hero in progress over settled Blitz',
          vertex,
          animationPhase: 'hero',
        }),
      },
      {
        file: 'crossing-proof-hero-settled-shared-vertex.json',
        proof: persistCrossingProof('hero settled at Blitz/Daily shared vertex', heroSettled, {
          sequenceStep: 'Daily hero finished via animation.finish()',
          vertex,
          animationPhase: 'settled',
        }),
      },
      {
        file: 'crossing-proof-quiet-live-shared-vertex.json',
        proof: persistCrossingProof('quiet live at Blitz/Daily shared vertex', quietLive, {
          sequenceStep: 'Daily quiet reselection in progress',
          vertex,
          animationPhase: 'quiet',
        }),
      },
      {
        file: 'crossing-proof-quiet-settled-shared-vertex.json',
        proof: persistCrossingProof('quiet settled at Blitz/Daily shared vertex', quietSettled, {
          sequenceStep: 'Daily quiet finished via animation.finish()',
          vertex,
          animationPhase: 'settled',
        }),
      },
      {
        file: 'crossing-proof-competing-reselected-settled-shared-vertex.json',
        proof: persistCrossingProof('competing Blitz reselected settled at shared vertex', competingSettled, {
          sequenceStep: 'Blitz quiet-reselected over Daily',
          vertex,
          animationPhase: 'settled',
        }),
      },
    ];
    for (const row of rows) {
      writeEvidenceJson(row.file, row.proof);
      const dir = evidenceDir();
      if (!dir) continue;
      const json = JSON.parse(readFileSync(join(dir, row.file), 'utf8')) as {
        sampledRgb: { r: number; g: number; b: number; a: number };
        image: {
          filename: string;
          sha256: string;
          clipX: number;
          clipY: number;
          clipWidth: number;
          clipHeight: number;
          sampledPixelX: number;
          sampledPixelY: number;
          searchRadius: number;
          screenshotScale: 'css';
        };
      };
      assertStoredProofMatchesImage(json, readFileSync(join(dir, json.image.filename)));
    }
  });
});
