import { get, set } from 'idb-keyval';
import type { Devoir } from '../features/devoirs/schema';

const cle = (id: string) => `devoir:${id}`;

export async function mettreEnCacheDevoir(id: string, devoir: Devoir): Promise<void> {
  await set(cle(id), devoir);
}

export async function chargerDevoirCache(id: string): Promise<Devoir | null> {
  const valeur = await get(cle(id));
  return (valeur as Devoir | undefined) ?? null;
}
