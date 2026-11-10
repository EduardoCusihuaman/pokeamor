import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const legacy = process.env.PARITY_LEGACY_URL ?? 'http://localhost:8787';
const svelte = process.env.PARITY_SVELTE_URL ?? 'http://localhost:5173';
const token = '0123456789abcdef'.repeat(4);
const art = `<svg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"><rect width="245" height="342" fill="#d8b8c8"/><rect x="10" y="10" width="225" height="322" rx="12" fill="#f5e7ed"/><circle cx="122" cy="145" r="65" fill="#a97994"/><path d="M57 145h130" stroke="#fff" stroke-width="8"/><circle cx="122" cy="145" r="17" fill="#fff"/><text x="122" y="270" text-anchor="middle" font-family="sans-serif" font-size="18">PARITY ART</text></svg>`;
const artPath = '/__parity__/art.svg';
const fontPath = '/__parity__/font.ttf';
const fontFile = process.env.PARITY_FONT_FILE ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const artHash = createHash('sha256').update(art).digest('hex');
let font: Buffer;

type Card = { id: number; image: string };
type Bundle = { catalog: Card[] };
type Measurement = {
  display: string;
  visibility: string;
  opacity: string;
  background: string;
  padding: string;
  gap: string;
  rect: { x: number; y: number; width: number; height: number };
  svg: string | null;
} | null;
let bundle: Bundle;
let referenceAssets: Array<{ url: string; sha256: string }>;

async function setup(
  browser: Browser,
  base: string,
  bundle: Bundle,
  count: number,
  viewport: { width: number; height: number },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport,
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  });
  const votes = Object.fromEntries(
    bundle.catalog.slice(0, count).map((card, i) => [card.id, { value: 'yes', time: i + 1 }]),
  );
  const state = {
    votes,
    ratings: {},
    duels: 0,
    history: bundle.catalog.slice(0, count).map((card) => ({ id: card.id, value: 'yes' })),
    revision: 0,
    voteTimes: {},
    ratingTimes: {},
    // Keep this discovery/collection fixture out of automatic battle scheduling.
    // Battle presentation needs its own parity scenarios; it must not replace
    // the front card while these screenshots are being measured.
    refinementSchedule: { nextSeen: bundle.catalog.length + 1 },
  };
  await context.addInitScript(
    ({ token, state }) => {
      localStorage.setItem('pokeamor-token', token);
      localStorage.setItem(`pokeamor-${token}`, JSON.stringify(state));
      localStorage.setItem(`pokeamor-${token}-introduced`, '1');
      let seed = 123456789;
      Math.random = () => {
        seed = (1664525 * seed + 1013904223) >>> 0;
        return seed / 4294967296;
      };
    },
    { token, state },
  );
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/catalog-bundle.json') return route.fulfill({ json: bundle });
    if (url.pathname === artPath)
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        headers: { 'access-control-allow-origin': '*' },
        body: art,
      });
    if (url.pathname === fontPath)
      return route.fulfill({
        status: 200,
        contentType: 'font/ttf',
        headers: { 'access-control-allow-origin': '*' },
        body: font,
      });
    if (url.hostname === 'fonts.googleapis.com')
      return route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: `@font-face{font-family:'DM Sans';src:url('${fontPath}');font-weight:100 900;font-style:normal}@font-face{font-family:'Playfair Display';src:url('${fontPath}');font-weight:100 900;font-style:italic}`,
      });
    if (url.hostname === 'fonts.gstatic.com')
      throw new Error(`Unexpected remote font request: ${url}`);
    if (url.pathname.startsWith('/api/session/'))
      return request.method() === 'GET'
        ? route.fulfill({ status: 404, json: { error: 'not-found' } })
        : route.fulfill({ status: 200, headers: { ETag: '"parity"' }, json: { saved: true } });
    if (request.resourceType() === 'image')
      throw new Error(`Unexpected unnormalized image: ${url}`);
    return route.continue();
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00.000Z'));
  await page.goto(`${base}/#s=${token}`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function ready(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const faces = await Promise.all([
      document.fonts.load('400 16px "DM Sans"'),
      document.fonts.load('italic 500 16px "Playfair Display"'),
    ]);
    await document.fonts.ready;
    if (faces.some((loaded) => !loaded.length || loaded.some((face) => face.status !== 'loaded')))
      throw new Error('Fixture fonts are not ready');
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function verifyImages(
  page: Page,
  selector: string,
  expectedCount: number,
): Promise<string[]> {
  const images = page.locator(selector);
  await expect(images).toHaveCount(expectedCount);
  const sheet = page.locator('#sheet.open');
  const initialScroll = (await sheet.count()) ? await sheet.evaluate((el) => el.scrollTop) : null;
  const hashes: string[] = [];
  try {
    // Legacy deliberately leaves offscreen thumbnails without src. Hydrate
    // each through real scrolling rather than defeating its lazy-load contract.
    for (let index = 0; index < expectedCount; index++) {
      const image = images.nth(index);
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(
          () =>
            image.evaluate(
              (el) => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0,
            ),
          {
            message: `Image ${index} at ${page.url()} must load when scrolled into view`,
          },
        )
        .toBeTruthy();
      hashes.push(
        await image.evaluate(async (element) => {
          if (!(element instanceof HTMLImageElement)) throw new Error('Expected image');
          try {
            await element.decode();
          } catch (error) {
            throw new Error(
              `Image decode failed at ${location.origin}: ${JSON.stringify({
                src: element.getAttribute('src'),
                currentSrc: element.currentSrc,
                loading: element.loading,
                complete: element.complete,
                width: element.naturalWidth,
                height: element.naturalHeight,
                html: element.outerHTML,
              })}`,
              { cause: error },
            );
          }
          if (element.naturalWidth !== 245 || element.naturalHeight !== 342)
            throw new Error(
              `Unexpected image dimensions ${element.naturalWidth}x${element.naturalHeight}: ${element.currentSrc}`,
            );
          const response = await fetch(element.currentSrc);
          if (!response.ok) throw new Error(`Cannot verify image bytes: ${element.currentSrc}`);
          const bytes = await response.arrayBuffer();
          return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('');
        }),
      );
    }
    return hashes;
  } finally {
    if (initialScroll !== null) {
      await sheet.evaluate((el, top) => {
        el.scrollTop = top;
      }, initialScroll);
      await ready(page);
    }
  }
}

async function comparePixels(
  left: Page,
  right: Page,
  label: string,
  info: import('@playwright/test').TestInfo,
): Promise<void> {
  if (info.config.updateSnapshots !== 'none')
    throw new Error('Snapshot updates are forbidden: legacy alone supplies the baseline');
  const baseline = info.snapshotPath(`${label}.png`);
  await mkdir(dirname(baseline), { recursive: true });
  const expected = await left.screenshot({ animations: 'disabled' });
  const actual = await right.screenshot({ animations: 'disabled' });
  // Playwright's pixelmatch also classifies anti-aliasing. Export an independent
  // raw RGBA count so its reported diff is not mistaken for byte-identical pixels.
  const raw = await right.evaluate(
    async (sources) => {
      const images = await Promise.all(
        sources.map(
          (source) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = () => reject(new Error('Cannot decode parity screenshot'));
              image.src = source;
            }),
        ),
      );
      const [a, b] = images;
      if (!a || !b || a.width !== b.width || a.height !== b.height)
        throw new Error('Parity screenshot dimensions differ');
      const pixels = images.map((image) => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Cannot decode pixels without canvas 2D');
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      });
      const first = pixels[0];
      const second = pixels[1];
      if (!first || !second) throw new Error('Missing screenshot pixels');
      let differentPixels = 0;
      let maxChannelDelta = 0;
      for (let i = 0; i < first.length; i += 4) {
        let differs = false;
        for (let channel = 0; channel < 4; channel++) {
          const delta = Math.abs(first[i + channel]! - second[i + channel]!);
          if (delta) differs = true;
          maxChannelDelta = Math.max(maxChannelDelta, delta);
        }
        if (differs) differentPixels++;
      }
      return { width: a.width, height: a.height, differentPixels, maxChannelDelta };
    },
    [expected, actual].map((image) => `data:image/png;base64,${image.toString('base64')}`),
  );
  await writeFile(baseline, expected);
  await info.attach(`${label}-raw-pixels.json`, {
    body: JSON.stringify(raw, null, 2),
    contentType: 'application/json',
  });
  await info.attach(`${label}-legacy`, { body: expected, contentType: 'image/png' });
  await info.attach(`${label}-svelte`, { body: actual, contentType: 'image/png' });
  expect
    .soft(actual, `${label}: live legacy pixel comparison`)
    .toMatchSnapshot(`${label}.png`, { maxDiffPixels: 0, threshold: 0 });
}

async function measure(
  page: Page,
  selectors: Record<string, string>,
): Promise<Record<string, Measurement>> {
  return page.evaluate(
    (selectors) =>
      Object.fromEntries(
        Object.entries(selectors).map(([key, selector]) => {
          const element = document.querySelector(selector);
          if (!element) return [key, null];
          const css = getComputedStyle(element);
          const r = element.getBoundingClientRect();
          return [
            key,
            {
              display: css.display,
              visibility: css.visibility,
              opacity: css.opacity,
              background: css.background,
              padding: css.padding,
              gap: css.gap,
              rect: { x: r.x, y: r.y, width: r.width, height: r.height },
              svg: element.querySelector('svg')?.outerHTML ?? null,
            },
          ];
        }),
      ),
    selectors,
  );
}

test.beforeAll(async ({ request }) => {
  if (new URL(legacy).origin === new URL(svelte).origin)
    throw new Error('Legacy and Svelte must be separate origins, not the same application');
  try {
    font = await readFile(fontFile);
  } catch (error) {
    throw new Error(`Parity font unavailable: ${fontFile}`, { cause: error });
  }
  for (const url of [legacy, svelte]) {
    try {
      const response = await request.get(url, { timeout: 5000 });
      if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
    } catch (error) {
      throw new Error(
        `Parity server unavailable at ${url}; start both servers before running: ${String(error)}`,
        { cause: error },
      );
    }
  }
  referenceAssets = await Promise.all(
    ['/', '/app.js', '/journey.js'].map(async (path) => {
      const url = new URL(path, legacy).href;
      const response = await request.get(url);
      if (!response.ok()) throw new Error(`Cannot fingerprint reference: ${url}`);
      return {
        url,
        sha256: createHash('sha256')
          .update(await response.body())
          .digest('hex'),
      };
    }),
  );
  const response = await request.get(`${legacy}/catalog-bundle.json`);
  expect(
    response.ok(),
    `Reference catalog unavailable: ${legacy}/catalog-bundle.json`,
  ).toBeTruthy();
  bundle = (await response.json()) as Bundle;
  expect(bundle.catalog.length).toBeGreaterThan(31);
  bundle.catalog = bundle.catalog.map((card) => ({
    ...card,
    image: artPath,
    surface: null,
    palette: { h: 325, s: 56, v: 79 },
  }));
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  for (const [scenario, count] of [
    ['empty', 0],
    ['one', 1],
    ['complete', 15],
    ['multiple', 31],
  ] as const) {
    test(`${viewport.width}x${viewport.height} ${scenario}: rendered parity`, async ({
      browser,
    }, info) => {
      await info.attach('reference-build.json', {
        body: JSON.stringify(
          { legacy, svelte, viewport, scenario, count, referenceAssets },
          null,
          2,
        ),
        contentType: 'application/json',
      });
      const left = await setup(browser, legacy, bundle, count, viewport);
      const right = await setup(browser, svelte, bundle, count, viewport);
      try {
        for (const page of [left.page, right.page])
          await page.locator('.stage .card:not(.under) img').first().waitFor({ timeout: 15000 });
        for (const page of [left.page, right.page]) {
          await ready(page);
          expect(await verifyImages(page, '.stage .card:not(.under) img', 1)).toEqual([artHash]);
        }
        const homeSelectors = {
          name: '#name',
          heart: '#likes > span, header .collection b > span',
          battle: '#front-refine',
        };
        const home = await Promise.all([
          measure(left.page, homeSelectors),
          measure(right.page, homeSelectors),
        ]);
        await comparePixels(left.page, right.page, 'home', info);
        for (const page of [left.page, right.page]) {
          await page.locator('#open, header button.collection').first().click();
          await page.locator('.batch-grid').first().waitFor({ timeout: 10000 });
        }
        const selectors = {
          tabs: '.collection-switch',
          active: '.active-batch',
          export: '.batch-export-bar',
          header: '.collection-header',
          slot: '.batch-grid > :first-child',
          grid: '.batch-grid',
        };
        const collection = await Promise.all([
          measure(left.page, selectors),
          measure(right.page, selectors),
        ]);
        const counts = await Promise.all(
          [left.page, right.page].map((page) => page.locator('.batch-grid .memory-card').count()),
        );
        for (const page of [left.page, right.page]) {
          await ready(page);
          expect(await verifyImages(page, '.batch-grid .memory-card img', count)).toEqual(
            Array(count).fill(artHash),
          );
        }
        await comparePixels(left.page, right.page, 'collection', info);
        await info.attach('computed-styles.json', {
          body: JSON.stringify(
            {
              home: { legacy: home[0], svelte: home[1] },
              collection: { legacy: collection[0], svelte: collection[1] },
            },
            null,
            2,
          ),
          contentType: 'application/json',
        });
        expect.soft(counts[0], 'reference seeded favorites rendered').toBe(count);
        expect.soft(counts[1], 'Svelte seeded favorites rendered').toBe(count);
        for (const key of ['name', 'heart'] as const)
          expect.soft(home[1][key]?.display, `${key} display`).toBe(home[0][key]?.display);
        // Compare rendered SVG shape, not markup formatting or aria attributes.
        const shapes = await Promise.all(
          [left.page, right.page].map((page) =>
            page
              .locator('#front-refine svg')
              .first()
              .evaluate((svg) =>
                [svg, ...svg.querySelectorAll('*')].map((node) => ({
                  tag: node.tagName,
                  attributes: [...node.attributes]
                    .filter((attribute) => !['aria-hidden', 'class'].includes(attribute.name))
                    .map(({ name, value }): [string, string] => [name, value])
                    .sort(([a], [b]) => a.localeCompare(b)),
                })),
              ),
          ),
        );
        expect.soft(shapes[1], 'active battle SVG').toEqual(shapes[0]);
        for (const key of ['tabs', 'export'] as const)
          expect
            .soft(collection[1][key]?.display, `${key} display`)
            .toBe(collection[0][key]?.display);
        if (collection[0].active)
          for (const property of ['padding', 'background'] as const)
            expect
              .soft(collection[1].active?.[property], `active batch ${property}`)
              .toBe(collection[0].active[property]);
        for (const key of ['header', 'slot'] as const)
          for (const property of ['x', 'y', 'width', 'height'] as const) {
            const a = collection[0][key]?.rect[property];
            const b = collection[1][key]?.rect[property];
            expect
              .soft(
                a !== undefined && b !== undefined && Math.abs(a - b) <= 1,
                `${key}.${property}: legacy=${a}, svelte=${b} (tolerance 1px)`,
              )
              .toBeTruthy();
          }
        for (const page of [left.page, right.page])
          await page.locator('#album-settings, .settings-icon').first().click({ timeout: 5000 });
        const settings = await Promise.all(
          [left.page, right.page].map((page) => page.locator('#collection-options').isVisible()),
        );
        for (const [label, page] of [
          ['legacy-settings', left.page],
          ['svelte-settings', right.page],
        ] as const)
          await info.attach(label, {
            body: await page.screenshot({ animations: 'disabled' }),
            contentType: 'image/png',
          });
        expect.soft(settings[0], 'reference settings panel visible').toBe(true);
        expect.soft(settings[1], 'settings panel visibility').toBe(settings[0]);
      } catch (error) {
        for (const [label, page] of [
          ['legacy-blocked', left.page],
          ['svelte-blocked', right.page],
        ] as const) {
          await info.attach(label, {
            body: await page.screenshot({ animations: 'disabled' }),
            contentType: 'image/png',
          });
        }
        throw error;
      } finally {
        await left.context.close();
        await right.context.close();
      }
    });
  }
}
