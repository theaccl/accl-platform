import { type Page } from '@playwright/test';
import { join } from 'node:path';
import { bundleComparisonHarness } from './bundleLandscapeTickerHarness';

const LAYOUT_FALLBACK = `
.fixed { position: fixed; }
.inset-0 { inset: 0; }
.z-\\[400\\] { z-index: 400; }
.flex { display: flex; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.flex-1 { flex: 1 1 0%; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-1\\.5 { gap: 0.375rem; }
.gap-2 { gap: 0.5rem; }
.shrink-0 { flex-shrink: 0; }
.space-y-2 > :not(:last-child) { margin-bottom: 0.5rem; }
.space-y-3 > :not(:last-child) { margin-bottom: 0.75rem; }
.m-0 { margin: 0; }
.mt-1 { margin-top: 0.25rem; }
.mt-2 { margin-top: 0.5rem; }
.mb-0 { margin-bottom: 0; }
.mb-1 { margin-bottom: 0.25rem; }
.p-0 { padding: 0; }
.p-4 { padding: 1rem; }
.px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
.px-2\\.5 { padding-left: 0.625rem; padding-right: 0.625rem; }
.px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
.py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.text-xs { font-size: 0.75rem; }
.text-sm { font-size: 0.875rem; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.text-white { color: #fff; }
.text-gray-200 { color: #e5e7eb; }
.text-gray-300 { color: #d1d5db; }
.text-gray-400 { color: #9ca3af; }
.text-gray-500 { color: #6b7280; }
.text-sky-300 { color: #7dd3fc; }
.tabular-nums { font-variant-numeric: tabular-nums; }
.rounded-md { border-radius: 0.375rem; }
.rounded-lg { border-radius: 0.5rem; }
.rounded-xl { border-radius: 0.75rem; }
.rounded-full { border-radius: 9999px; }
.border { border-width: 1px; border-style: solid; }
.w-full { width: 100%; }
.max-w-full { max-width: 100%; }
.h-2 { height: 0.5rem; }
.w-2 { width: 0.5rem; }
.h-2\\.5 { height: 0.625rem; }
.w-2\\.5 { width: 0.625rem; }
.relative { position: relative; }
.absolute { position: absolute; }
.inline-block { display: inline-block; }
.list-none { list-style: none; }
.opacity-60 { opacity: 0.6; }
.cursor-pointer { cursor: pointer; }
.bg-\\[\\#0b121c\\] { background: #0b121c; }
`;

export type MountComparisonOptions = {
  empty?: boolean;
  crossing?: boolean;
  single?: boolean;
  viewport?: { width: number; height: number };
};

async function compileHarnessTailwind(root: string): Promise<string> {
  const postcssMod = await import('postcss');
  const tailwindMod = await import('@tailwindcss/postcss');
  const postcss = postcssMod.default ?? postcssMod;
  const tailwindcss = tailwindMod.default ?? tailwindMod;
  const ratings = join(root, 'components/profile/ratings').replace(/\\/g, '/');
  const entry = join(root, 'tests/helpers/comparisonHarnessEntry.tsx').replace(/\\/g, '/');
  const input = `@import "tailwindcss";\n@source "${ratings}";\n@source "${entry}";\n`;
  const result = await postcss([tailwindcss()]).process(input, {
    from: join(root, 'tests/helpers/harness-tailwind.css'),
  });
  return result.css;
}

export async function mountComparisonPanel(page: Page, opts: MountComparisonOptions = {}): Promise<void> {
  const root = process.cwd();
  const bundle = bundleComparisonHarness(root);
  let utilities = LAYOUT_FALLBACK;
  let cssSource: 'tailwind' | 'fallback' = 'fallback';
  try {
    const compiled = await compileHarnessTailwind(root);
    if (compiled.trim()) {
      utilities = compiled;
      cssSource = 'tailwind';
    }
  } catch {
    utilities = LAYOUT_FALLBACK;
    cssSource = 'fallback';
  }

  if (opts.viewport) {
    await page.setViewportSize(opts.viewport);
  }

  await page.setContent(`<!DOCTYPE html>
<html lang="en" data-harness-css="${cssSource}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      ${utilities}
      ${bundle.css}
    </style>
  </head>
  <body style="margin:0;background:#070b10;color:#e5e7eb">
    <div id="root"></div>
  </body>
</html>`);

  const harnessOptions = {
    empty: Boolean(opts.empty),
    crossing: Boolean(opts.crossing),
    single: Boolean(opts.single),
  };
  await page.addScriptTag({
    content: `window.__HARNESS_OPTIONS = ${JSON.stringify(harnessOptions)};`,
  });
  await page.addScriptTag({ content: bundle.js });
  await page.getByTestId('comparison-harness').waitFor({ state: 'attached' });
  if (opts.single) {
    await page.getByTestId('rating-track-detail-panel').waitFor();
  } else if (!opts.empty) {
    await page.getByTestId('rating-family-comparison-panel').waitFor();
  }
}
