import { describe, expect, it } from 'vitest';
import { enfantSchema } from './schema';

const valide = {
  nom: 'Kouassi', prenoms: 'Lamine', dateNaissance: '2019-03-12',
  sexe: 'M', classe: 'CP1', etablissement: 'EPP Cocody',
  systeme: 'IVOIRIEN', matieres: ['Français', 'Mathématiques'],
};

describe('enfantSchema', () => {
  it('accepte un enfant valide', () => {
    expect(enfantSchema.safeParse(valide).success).toBe(true);
  });
  it('refuse un nom vide', () => {
    expect(enfantSchema.safeParse({ ...valide, nom: '' }).success).toBe(false);
  });
  it('refuse une date de naissance future', () => {
    expect(enfantSchema.safeParse({ ...valide, dateNaissance: '2099-01-01' }).success).toBe(false);
  });
  it('refuse une classe inconnue', () => {
    expect(enfantSchema.safeParse({ ...valide, classe: 'CP9' }).success).toBe(false);
  });
  it('exige au moins une matière', () => {
    expect(enfantSchema.safeParse({ ...valide, matieres: [] }).success).toBe(false);
  });
});
