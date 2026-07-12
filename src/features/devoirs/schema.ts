import { z } from 'zod';

// Devoir IMPRIMABLE côté client (sans corrigé — voir la frontière de sécurité
// en tête de plan). Le contrat complet vit dans supabase/functions/_shared/devoir.ts.
export const TYPES_EXERCICE = ['ecriture', 'qcm', 'calcul', 'appariement', 'coloriage', 'libre'] as const;
export const ESPACES_REPONSE = ['lignes', 'cadre', 'aucun'] as const;

const exerciceSchema = z.object({
  numero: z.number().int().positive(),
  consigne: z.string().min(1),
  type: z.enum(TYPES_EXERCICE),
  items: z.array(z.string()),
  espaceReponse: z.enum(ESPACES_REPONSE),
  points: z.number().int().nonnegative().optional(),
});

export const devoirSchema = z.object({
  matieres: z
    .array(z.object({ nom: z.string().min(1), exercices: z.array(exerciceSchema).min(1) }))
    .min(1),
});

export type Devoir = z.infer<typeof devoirSchema>;
