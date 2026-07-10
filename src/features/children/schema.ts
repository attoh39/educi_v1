import { z } from 'zod';
import { CLASSES } from '../../domain/classes';
import { fr } from '../../i18n/fr';

export const enfantSchema = z.object({
  nom: z.string().min(1, fr.validation.requis),
  prenoms: z.string().min(1, fr.validation.requis),
  dateNaissance: z
    .string()
    .min(1, fr.validation.requis)
    .refine((d) => new Date(d) <= new Date(), fr.validation.dateFuture),
  sexe: z.enum(['M', 'F']),
  classe: z.enum(CLASSES),
  etablissement: z.string().min(1, fr.validation.requis),
  systeme: z.enum(['IVOIRIEN', 'FRANCAIS', 'AUTRE']),
  matieres: z.array(z.string()).min(1, fr.validation.matiereMin),
});

export type EnfantFormValues = z.infer<typeof enfantSchema>;
