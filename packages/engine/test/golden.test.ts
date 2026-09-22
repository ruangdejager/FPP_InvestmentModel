import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runProjection } from '../src/projection.js';
import { goldenInput } from './golden-scenario.js';

const GOLDEN_PATH = fileURLToPath(new URL('./golden/base-scenario.json', import.meta.url));

/**
 * The golden fixture.
 *
 * One fully specified scenario with its complete 240 month output committed to
 * the repository. Any change to the engine that alters it must be deliberate,
 * and the diff must be reviewable. Regenerate with:
 *
 *   npm run golden:update -w @fp/engine
 */
describe('golden fixture', () => {
  const projection = runProjection(goldenInput());

  if (process.env.UPDATE_GOLDEN === '1') {
    it('regenerates the committed output', () => {
      writeFileSync(
        GOLDEN_PATH,
        `${JSON.stringify({ months: projection.months, summary: projection.summary }, null, 2)}\n`,
        'utf8',
      );
      expect(true).toBe(true);
    });
    return;
  }

  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as {
    months: unknown[];
    summary: Record<string, unknown>;
  };

  it('reproduces all 240 committed months exactly', () => {
    expect(projection.months).toHaveLength(240);
    expect(projection.months).toEqual(golden.months);
  });

  it('reproduces the committed summary exactly', () => {
    expect(projection.summary).toEqual(golden.summary);
  });
});
