import { televerserCopie } from './api';
import { cheminCopie } from './chemin';
import type { ElementFile } from './copiesQueue';

export type ResultatEnvoi = { envoyes: string[]; echoues: string[] };

// Téléverse chaque élément ; poursuit malgré les échecs (réseau instable).
export async function envoyerElements(
  parentId: string,
  childId: string,
  homeworkId: string,
  elements: ElementFile[],
): Promise<ResultatEnvoi> {
  const envoyes: string[] = [];
  const echoues: string[] = [];
  for (const e of elements) {
    const chemin = cheminCopie(parentId, childId, homeworkId, e.id);
    try {
      await televerserCopie(chemin, e.blob);
      envoyes.push(chemin);
    } catch {
      echoues.push(e.id);
    }
  }
  return { envoyes, echoues };
}
