// Migrado de tests/06-deck.test.cjs — reconciliación del deck reutilizando nodos.
// Se conservan todas las aserciones del original y se prueba el módulo TS
// directamente (sin `node:vm` ni `slice()`).
import { describe, expect, it } from 'vitest';

import {
  reconcileDeck,
  type DeckCardKey,
  type DeckCardNode,
  type DeckStage,
} from '@/engines/deck/reconcile';

interface Card extends DeckCardKey {
  readonly id: number;
  readonly card: string;
}

class TestNode implements DeckCardNode<Card> {
  readonly pokemon: Card;
  hidden = false;
  activated: boolean;
  under: boolean;
  exiting = false;
  parentElement: TestStage | null = null;

  constructor(card: Card, under: boolean) {
    this.pokemon = card;
    this.under = under;
    this.activated = !under;
  }

  activate(): void {
    this.under = false;
    this.activated = true;
  }

  setUnder(): void {
    this.under = true;
    this.activated = false;
  }

  stopMotion(): void {}

  remove(): void {
    const parent = this.parentElement;
    if (parent) parent.children = parent.children.filter((child) => child !== this);
    this.parentElement = null;
  }
}

class TestStage implements DeckStage<Card, TestNode> {
  children: TestNode[] = [];

  get firstChild(): TestNode | null {
    return this.children[0] ?? null;
  }

  querySelectorAll(selector: string): TestNode[] {
    return this.children.filter((child) =>
      selector.includes(':not') ? !child.exiting : child.exiting,
    );
  }

  insertBefore(node: TestNode): void {
    node.remove();
    this.children.unshift(node);
    node.parentElement = this;
  }

  append(node: TestNode): void {
    node.remove();
    this.children.push(node);
    node.parentElement = this;
  }
}

describe('reconcileDeck', () => {
  it('advancing promotes the same back node and builds only one next card', () => {
    const stage = new TestStage();
    const created = { count: 0 };

    const makeCard = (card: Card, under: boolean): TestNode => {
      created.count += 1;
      return new TestNode(card, under);
    };

    const a = new TestNode({ id: 1, card: 'a' }, false);
    const b = new TestNode({ id: 2, card: 'b' }, true);

    stage.append(b);
    stage.append(a);
    a.exiting = true;

    const first = reconcileDeck(stage, [b.pokemon, { id: 3, card: 'c' }], [a], { makeCard });

    expect(stage.children.find((child) => child.pokemon.id === 2)).toBe(b);
    expect(b.under).toBe(false);
    expect(created.count).toBe(1);
    expect(first.front).toBe(b);
    expect(first.back?.pokemon).toEqual({ id: 3, card: 'c' });

    // La segunda pasada reutiliza ambos nodos: no crea ninguna carta más.
    reconcileDeck(stage, [b.pokemon, { id: 3, card: 'c' }], [a], { makeCard });
    expect(created.count).toBe(1);
  });
});
