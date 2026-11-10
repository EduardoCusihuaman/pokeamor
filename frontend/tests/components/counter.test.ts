import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import Counter from './Counter.svelte'

test('increments the count when the button is clicked', async () => {
  const screen = await render(Counter)

  await expect.element(screen.getByText('Count is 0')).toBeVisible()

  await screen.getByRole('button', { name: 'Increment' }).click()

  await expect.element(screen.getByText('Count is 1')).toBeVisible()
})
