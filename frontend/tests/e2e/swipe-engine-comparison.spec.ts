import { expect, test } from '@playwright/test';

test('swipe feedback matches legacy at ±50px and cancellation does not vote', async ({
  browser,
}, testInfo) => {
  test.skip(!process.env.SWIPE_LEGACY_URL, 'Set SWIPE_LEGACY_URL to run the legacy comparison');
  const token = '0123456789abcdef'.repeat(4);
  const samples: Array<Array<{ yes: number; no: number; fill: number; opacity: number }>> = [];
  for (const base of [process.env.SWIPE_LEGACY_URL!, 'http://localhost:5173']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
    });
    try {
      await context.addInitScript((token) => {
        localStorage.setItem('pokeamor-token', token);
        localStorage.setItem(`pokeamor-${token}-introduced`, '1');
        let seed = 123456789;
        Math.random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
      }, token);
      await context.route('**/*', async (route) => {
        const request = route.request();
        if (new URL(request.url()).pathname.startsWith('/api/session/'))
          return route.fulfill({ status: 404, json: { error: 'not-found' } });
        if (request.resourceType() === 'image')
          return route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="245" height="342"><rect width="245" height="342" fill="pink"/></svg>',
          });
        return route.continue();
      });
      const page = await context.newPage();
      await page.goto(`${base}/#s=${token}`);
      const card = page.locator('.stage .card:not(.under):not(.exiting)').first();
      await card.waitFor({ state: 'visible' });
      await page.waitForTimeout(1500);
      const initial = await card.getAttribute('aria-label');
      const values = [];
      for (const dx of [50, -50]) {
        const box = await card.boundingBox();
        if (!box) throw new Error('Card has no layout');
        const x = box.x + box.width / 2,
          y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + dx, y + 10, { steps: 5 });
        const value = await card.evaluate((element) => {
          const seal = element.querySelector<HTMLElement>('.swipe-seal')!;
          return {
            yes: Number(document.documentElement.style.getPropertyValue('--yes-intent')),
            no: Number(document.documentElement.style.getPropertyValue('--no-intent')),
            fill: Number(seal.style.getPropertyValue('--seal-fill')),
            opacity: Number(seal.style.opacity),
          };
        });
        values.push(value);
        await testInfo.attach(`${base.includes('8787') ? 'legacy' : 'svelte'}-${dx}.png`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
        await card.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true });
        await page.mouse.up();
        await expect.poll(() => card.getAttribute('aria-label')).toBe(initial);
        expect(
          await page.evaluate(() => [
            Number(document.documentElement.style.getPropertyValue('--yes-intent')),
            Number(document.documentElement.style.getPropertyValue('--no-intent')),
          ]),
        ).toEqual([0, 0]);
        await page.waitForTimeout(500);
      }
      samples.push(values);
    } finally {
      await context.close();
    }
  }
  for (let i = 0; i < 2; i++) {
    expect(samples[1]![i]!.yes).toBeCloseTo(samples[0]![i]!.yes, 2);
    expect(samples[1]![i]!.no).toBeCloseTo(samples[0]![i]!.no, 2);
    expect(samples[1]![i]!.fill).toBeCloseTo(samples[0]![i]!.fill, 2);
    expect(samples[1]![i]!.opacity).toBe(samples[0]![i]!.opacity);
    expect(i === 0 ? samples[1]![i]!.yes : samples[1]![i]!.no).toBeGreaterThan(0);
  }
});
