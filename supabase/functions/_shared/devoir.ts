import { z } from 'npm:zod@3';

// Contrat partagé avec le client : src/features/devoirs/schema.ts.
// Toute évolution doit être répercutée dans les deux fichiers.
export const TYPES_EXERCICE = ['ecriture', 'qcm', 'calcul', 'appariement', 'coloriage', 'libre'] as const;
export const ESPACES_REPONSE = ['lignes', 'cadre', 'aucun'] as const;

export const devoirSchema = z.object({
  matieres: z
    .array(
      z.object({
        nom: z.string().min(1),
        exercices: z
          .array(
            z.object({
              numero: z.number().int().positive(),
              consigne: z.string().min(1),
              type: z.enum(TYPES_EXERCICE),
              items: z.array(z.string()),
              espaceReponse: z.enum(ESPACES_REPONSE),
              points: z.number().int().nonnegative().optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
  corrige: z.array(
    z.object({
      matiere: z.string().min(1),
      numero: z.number().int().positive(),
      reponse: z.string(),
      explication: z.string(),
    }),
  ),
});

export type Devoir = z.infer<typeof devoirSchema>;

// JSON Schema envoyé à Claude via output_config.format. Les contraintes non
// supportées par les sorties structurées (minLength, min…) sont volontairement
// omises ici ; la validation fine est faite par zod après réception.
export const DEVOIR_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    matieres: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          nom: { type: 'string' },
          exercices: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                numero: { type: 'integer' },
                consigne: { type: 'string' },
                type: { type: 'string', enum: [...TYPES_EXERCICE] },
                items: { type: 'array', items: { type: 'string' } },
                espaceReponse: { type: 'string', enum: [...ESPACES_REPONSE] },
                points: { type: 'integer' },
              },
              required: ['numero', 'consigne', 'type', 'items', 'espaceReponse'],
            },
          },
        },
        required: ['nom', 'exercices'],
      },
    },
    corrige: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          matiere: { type: 'string' },
          numero: { type: 'integer' },
          reponse: { type: 'string' },
          explication: { type: 'string' },
        },
        required: ['matiere', 'numero', 'reponse', 'explication'],
      },
    },
  },
  required: ['matieres', 'corrige'],
} as const;
