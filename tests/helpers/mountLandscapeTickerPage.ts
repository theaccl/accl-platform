import { type Page } from '@playwright/test';
import { join } from 'node:path';
import { bundleLandscapeTickerHarness } from './bundleLandscapeTickerHarness';

const LAYOUT_FALLBACK = `
.fixed { position: fixed; }
.inset-0 { inset: 0; }
.z-\\[400\\] { z-index: 400; }
.flex { display: flex; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.flex-1 { flex: 1 1 0%; }
.min-h-0 { min-height: 0; }
.min-w-0 { min-width: 0; }
.max-h-\\[100dvh\\] { max-height: 100dvh; }
.max-w-\\[100dvw\\] { max-width: 100dvw; }
.overflow-hidden { overflow: hidden; }
.overflow-x-auto { overflow-x: auto; }
.overflow-y-auto { overflow-y: auto; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.justify-center { justify-content: center; }
.gap-1 { gap: 0.25rem; }
.gap-1\\.5 { gap: 0.375rem; }
.gap-2 { gap: 0.5rem; }
.gap-3 { gap: 0.75rem; }
.shrink-0 { flex-shrink: 0; }
.px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
.px-2\\.5 { padding-left: 0.625rem; padding-right: 0.625rem; }
.px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
.px-4 { padding-left: 1rem; padding-right: 1rem; }
.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
.pb-1 { padding-bottom: 0.25rem; }
.m-0 { margin: 0; }
.mt-0\\.5 { margin-top: 0.125rem; }
.mt-1 { margin-top: 0.25rem; }
.mt-2 { margin-top: 0.5rem; }
.mb-0 { margin-bottom: 0; }
.text-xs { font-size: 0.75rem; }
.text-sm { font-size: 0.875rem; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.text-white { color: #fff; }
.text-gray-200 { color: #e5e7eb; }
.text-gray-400 { color: #9ca3af; }
.text-gray-500 { color: #6b7280; }
.text-sky-300 { color: #7dd3fc; }
.tabular-nums { font-variant-numeric: tabular-nums; }
.rounded-md { border-radius: 0.375rem; }
.rounded-lg { border-radius: 0.5rem; }
.rounded-full { border-radius: 9999px; }
.border { border-width: 1px; border-style: solid; }
.border-b { border-bottom-width: 1px; border-bottom-style: solid; }
.w-full { width: 100%; }
.h-full { height: 100%; }
.h-2\\.5 { height: 0.625rem; }
.w-2\\.5 { width: 0.625rem; }
.min-h-\\[11rem\\] { min-height: 11rem; }
.relative { position: relative; }
.absolute { position: absolute; }
.inline-block { display: inline-block; }
.space-y-2 > :not(:last-child) { margin-bottom: 0.5rem; }
.list-none { list-style: none; }
.p-0 { padding: 0; }
.bg-\\[\\#070b10\\]\\/95 { background: rgba(7, 11, 16, 0.95); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
`;

export type MountTickerOptions = {
  empty?: boolean;
  open?: boolean;
  crossing?: boolean;
  reducedMotion?: boolean;
  forceOffsetPath?: boolean;
  viewport?: { width: number; height: number };
};

async function compileHarnessTailwind(root: string): Promise<string> {
  const postcssMod = await import('postcss');
  const tailwindMod = await import('@tailwindcss/postcss');
  const postcss = postcssMod.default ?? postcssMod;
  const tailwindcss = tailwindMod.default ?? tailwindMod;
  const ratings = join(root, 'components/profile/ratings').replace(/\\/g, '/');
  const entry = join(root, 'tests/helpers/landscapeTickerHarnessEntry.tsx').replace(/\\/g, '/');
  const input = `@import "tailwindcss";\n@source "${ratings}";\n@source "${entry}";\n`;
  const result = await postcss([tailwindcss()]).process(input, {
    from: join(root, 'tests/helpers/harness-tailwind.css'),
  });
  return result.css;
}

export async function mountLandscapeTicker(page: Page, opts: MountTickerOptions = {}): Promise<void> {
  const root = process.cwd();
  const bundle = bundleLandscapeTickerHarness(root);
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
  if (opts.reducedMotion) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }

  await page.setContent(`<!DOCTYPE html>
<html lang="en" data-harness-css="${cssSource}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      ${utilities}
      ${bundle.css}
      :root {
        --accl-accent-crimson: #9e3434;
        --accl-accent-crimson-bright: #ef4444;
      }
      .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    </style>
  </head>
  <body style="margin:0;background:#070b10;color:#e5e7eb">
    <div id="root"></div>
  </body>
</html>`);

  const harnessOptions = {
    empty: Boolean(opts.empty),
    open: opts.open !== false,
    crossing: Boolean(opts.crossing),
  };
  const offsetPathMock =
    opts.forceOffsetPath === false
      ? `var orig = CSS.supports.bind(CSS);
         CSS.supports = function(prop, value) {
           var blob = (String(prop) + ' ' + (value || '')).toLowerCase();
           if (blob.indexOf('offset-path') !== -1) return false;
           return value == null ? orig(prop) : orig(prop, value);
         };`
      : '';
  await page.addScriptTag({
    content: `window.__HARNESS_OPTIONS = ${JSON.stringify(harnessOptions)};\n${offsetPathMock}`,
  });
  await page.addScriptTag({ content: bundle.js });
  await page.getByTestId('landscape-ticker-harness').waitFor({ state: 'attached' });
  if (opts.open !== false) {
    await page.getByTestId('expanded-rating-ticker-drawer').waitFor();
  }
}
