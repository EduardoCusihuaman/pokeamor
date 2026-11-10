import { describe, expect, it } from 'vitest'

const add = (a: number, b: number): number => a + b

describe('add', () => {
  it('adds two numbers', () => {
    expect(add(1, 1)).toBe(2)
  })
})
