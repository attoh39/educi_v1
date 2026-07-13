import { z } from 'zod';

export const STATUTS_EXERCICE = ['reussi', 'partiel', 'a_revoir'] as const;

const detailSchema = z.object({
  matiere: z.string(),
  numero: z.number().int().positive(),
  statut: z.enum(STATUTS_EXERCICE),
  explication: z.string(),
  bonneReponse: z.string(),
});

export const correctionSchema = z.object({
  note: z.number().min(0).max(20).optional(),
  appreciation: z.string(),
  details: z.array(detailSchema),
});

export type Correction = z.infer<typeof correctionSchema>;
export type StatutExercice = (typeof STATUTS_EXERCICE)[number];
