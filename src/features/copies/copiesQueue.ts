import { get, set } from 'idb-keyval';

export type ElementFile = { id: string; blob: Blob };

const cle = (homeworkId: string) => `copies:file:${homeworkId}`;

export async function ajouterEnFile(homeworkId: string, blob: Blob): Promise<ElementFile> {
  const item: ElementFile = { id: crypto.randomUUID(), blob };
  const file = (await get<ElementFile[]>(cle(homeworkId))) ?? [];
  await set(cle(homeworkId), [...file, item]);
  return item;
}

export async function lireFile(homeworkId: string): Promise<ElementFile[]> {
  return (await get<ElementFile[]>(cle(homeworkId))) ?? [];
}

export async function retirerDeFile(homeworkId: string, id: string): Promise<void> {
  const file = (await get<ElementFile[]>(cle(homeworkId))) ?? [];
  await set(cle(homeworkId), file.filter((e) => e.id !== id));
}
