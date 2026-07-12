import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (k: string) => store.get(k)),
  set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
}));

import { chargerDevoirCache, mettreEnCacheDevoir } from './devoirsCache';

beforeEach(() => store.clear());

const devoir = { matieres: [], corrige: [] };

describe('cache des devoirs', () => {
  it('met en cache puis recharge un devoir par id', async () => {
    await mettreEnCacheDevoir('h1', devoir);
    expect(await chargerDevoirCache('h1')).toEqual(devoir);
  });
  it('retourne null pour un id absent', async () => {
    expect(await chargerDevoirCache('inconnu')).toBeNull();
  });
});
