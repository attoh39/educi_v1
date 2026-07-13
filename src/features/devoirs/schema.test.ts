import { describe, expect, it } from 'vitest';
import { devoirSchema } from './schema';

const valide = {
  matieres: [
    {
      nom: 'Français',
      exercices: [
        { numero: 1, consigne: 'Lis les syllabes.', type: 'ecriture', items: ['MA', 'ME'], espaceReponse: 'lignes' },
      ],
    },
  ],
  corrige: [{ matiere: 'Français', numero: 1, reponse: 'MA, ME', explication: 'Syllabes avec M.' }],
};

describe('devoirSchema', () => {
  it('accepte un devoir valide', () => {
    expect(devoirSchema.safeParse(valide).success).toBe(true);
  });
  it('refuse un type d’exercice inconnu', () => {
    const x = structuredClone(valide);
    (x.matieres[0].exercices[0] as { type: string }).type = 'dictée';
    expect(devoirSchema.safeParse(x).success).toBe(false);
  });
  it('refuse une matière sans exercices', () => {
    const x = structuredClone(valide);
    x.matieres[0].exercices = [];
    expect(devoirSchema.safeParse(x).success).toBe(false);
  });
  it('exige au moins une matière', () => {
    expect(devoirSchema.safeParse({ ...valide, matieres: [] }).success).toBe(false);
  });
  it('accepte un exercice avec un barème points', () => {
    const x = structuredClone(valide);
    (x.matieres[0].exercices[0] as { points?: number }).points = 3;
    expect(devoirSchema.safeParse(x).success).toBe(true);
  });
  it('refuse un points négatif', () => {
    const x = structuredClone(valide);
    (x.matieres[0].exercices[0] as { points?: number }).points = -1;
    expect(devoirSchema.safeParse(x).success).toBe(false);
  });
});
