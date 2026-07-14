import { z } from 'zod';

export const STATUTS_EXERCICE = ['reussi', 'partiel', 'a_revoir'] as const;
export const MAITRISES = ['acquis', 'en_cours', 'fragile'] as const;

const detailSchema = z.object({
  matiere: z.string(),
  numero: z.number().int().positive(),
  statut: z.enum(STATUTS_EXERCICE),
  explication: z.string(),
  bonneReponse: z.string(),
});

const competenceSchema = z.object({
  matiere: z.string(),
  libelle: z.string(),
  maitrise: z.enum(MAITRISES),
});

export const correctionSchema = z.object({
  note: z.number().min(0).max(20).optional(),
  appreciation: z.string(),
  details: z.array(detailSchema),
  // Optionnel côté client : l'Edge Function de correction ne renvoie pas les
  // compétences au navigateur (elles alimentent le dossier côté serveur).
  competences: z.array(competenceSchema).optional(),
});

export type Correction = z.infer<typeof correctionSchema>;
export type StatutExercice = (typeof STATUTS_EXERCICE)[number];
export type Maitrise = (typeof MAITRISES)[number];
