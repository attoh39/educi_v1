import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (k: string) => store.get(k)),
  set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
}));

import { ajouterEnFile, lireFile, retirerDeFile } from './copiesQueue';

beforeEach(() => store.clear());

describe('file des copies', () => {
  it('ajoute, lit puis retire un élément', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const item = await ajouterEnFile('h1', blob);
    expect((await lireFile('h1')).map((e) => e.id)).toEqual([item.id]);
    await retirerDeFile('h1', item.id);
    expect(await lireFile('h1')).toEqual([]);
  });
  it('isole les files par devoir', async () => {
    await ajouterEnFile('h1', new Blob(['a']));
    expect(await lireFile('h2')).toEqual([]);
  });
});
