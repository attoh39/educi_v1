import { describe, expect, it } from 'vitest';
import { correctionSchema } from './schema';

const valide = {
  note: 15,
  appreciation: 'Bon travail.',
  details: [{ matiere: 'Français', numero: 1, statut: 'reussi', explication: 'ok', bonneReponse: 'MA' }],
  competences: [{ matiere: 'Français', libelle: 'syllabes', maitrise: 'en_cours' }],
};

describe('correctionSchema', () => {
  it('accepte une correction notée', () => {
    expect(correctionSchema.safeParse(valide).success).toBe(true);
  });
  it('accepte une note absente (primaire)', () => {
    const { note: _omit, ...sansNote } = valide;
    expect(correctionSchema.safeParse(sansNote).success).toBe(true);
  });
  it('refuse un statut inconnu', () => {
    const x = structuredClone(valide);
    (x.details[0] as { statut: string }).statut = 'nul';
    expect(correctionSchema.safeParse(x).success).toBe(false);
  });
  it('accepte des competences vides', () => {
    expect(correctionSchema.safeParse({ ...valide, competences: [] }).success).toBe(true);
  });
  it('refuse une maitrise inconnue', () => {
    const x = structuredClone(valide);
    (x.competences[0] as { maitrise: string }).maitrise = 'super';
    expect(correctionSchema.safeParse(x).success).toBe(false);
  });
});
