import { z } from 'npm:zod@3';

export const PROMPT_VERSION_CORRECTION = 'correction-v1';
export const STATUTS_EXERCICE = ['reussi', 'partiel', 'a_revoir'] as const;

export const correctionSchema = z.object({
  note: z.number().min(0).max(20).optional(),
  appreciation: z.string().min(1),
  details: z.array(
    z.object({
      matiere: z.string().min(1),
      numero: z.number().int().positive(),
      statut: z.enum(STATUTS_EXERCICE),
      explication: z.string(),
      bonneReponse: z.string(),
    }),
  ),
});

export type Correction = z.infer<typeof correctionSchema>;

export const CORRECTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    note: { type: 'number' },
    appreciation: { type: 'string' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          matiere: { type: 'string' },
          numero: { type: 'integer' },
          statut: { type: 'string', enum: [...STATUTS_EXERCICE] },
          explication: { type: 'string' },
          bonneReponse: { type: 'string' },
        },
        required: ['matiere', 'numero', 'statut', 'explication', 'bonneReponse'],
      },
    },
  },
  required: ['appreciation', 'details'],
} as const;

const COMMUN = `Tu es un enseignant qui corrige la copie manuscrite d'un élève en Côte d'Ivoire.
On te fournit l'énoncé du devoir, le corrigé de référence, et les photos de la copie de l'élève.
Règles :
- Réponds UNIQUEMENT avec un objet JSON conforme au schéma imposé, sans texte autour.
- Lis attentivement l'écriture manuscrite de l'enfant, même imparfaite.
- Compare chaque réponse au corrigé de référence.
- Pour chaque exercice, donne un statut ("reussi", "partiel" ou "a_revoir"),
  une explication courte et bienveillante, et la bonne réponse.
- Rédige en français, avec des mots simples et encourageants.
- Si une copie est illisible, indique-le dans l'appréciation et mets "a_revoir".`;

export function profilCorrection(mode: 'primaire' | 'secondaire'): string {
  if (mode === 'secondaire') {
    return `${COMMUN}
Niveau secondaire : attribue une note chiffrée "note" sur 20, égale à la somme des points obtenus
selon le barème de l'énoncé. Corrigé détaillé.`;
  }
  return `${COMMUN}
Niveau primaire : NE mets PAS de "note" chiffrée (omets le champ). Donne une appréciation
qualitative globale et un statut par exercice. Ton très encourageant.`;
}
