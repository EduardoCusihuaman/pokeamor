import { expect, test } from '@playwright/test';
import { gotoApp, mockBackend } from './fixtures';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`swipes preserve artwork and keep the page still at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockBackend(page);
    await gotoApp(page);
    await expect(page.getByRole('article', { name: 'Pikachu' })).toBeVisible();
    const header = await page.locator('header').first().boundingBox();
    expect(header).not.toBeNull();

    for (const [index, name] of ['Pikachu', 'Bulbasaur', 'Charmander'].entries()) {
      const card = page.getByRole('article', { name, exact: true });
      const image = card.locator('img');
      await expect
        .poll(() =>
          image.evaluate(
            (el) => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0,
          ),
        )
        .toBe(true);
      const rect = await card.boundingBox();
      if (!rect) throw new Error(`Missing card ${name}`);
      const samples = page.evaluate(
        () =>
          new Promise<number[][]>((resolve) => {
            const values: number[][] = [];
            const start = performance.now();
            function frame() {
              const bounds = document.querySelector('header')!.getBoundingClientRect();
              values.push([
                scrollX,
                scrollY,
                bounds.x,
                bounds.y,
                bounds.width,
                innerWidth,
                innerHeight,
              ]);
              if (performance.now() - start < 700) requestAnimationFrame(frame);
              else resolve(values);
            }
            frame();
          }),
      );
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.mouse.down();
      const direction = index % 2 === 0 ? 1 : -1;
      await page.mouse.move(
        rect.x + rect.width / 2 + direction * 110,
        rect.y + rect.height / 2 + 8,
        { steps: 10 },
      );
      await expect(card).toHaveClass(/active/);
      await expect(card.locator('.foil, .glint')).toHaveCount(0);
      await page.mouse.up();
      for (const sample of await samples) {
        expect(sample).toEqual([
          0,
          0,
          header!.x,
          header!.y,
          header!.width,
          viewport.width,
          viewport.height,
        ]);
      }
      const promoted = page.locator('.stage .card:not(.under):not(.exiting)');
      await expect(promoted).toHaveCount(1);
      expect(
        await promoted.evaluate((el) => ({
          transform: (el as HTMLElement).style.transform,
          filter: (el as HTMLElement).style.filter,
        })),
      ).toEqual({ transform: '', filter: '' });
    }
  });
}
