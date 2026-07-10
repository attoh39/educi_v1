import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  anneeScolaire,
  classeLabel,
  cycleOf,
  matieresParDefaut,
  modeGenerationOf,
} from './classes';

describe('CLASSES', () => {
  it('couvre la maternelle à la terminale (16 classes)', () => {
    expect(CLASSES).toHaveLength(16);
    expect(CLASSES[0]).toBe('PS');
    expect(CLASSES[15]).toBe('TERMINALE');
  });
});

describe('cycleOf', () => {
  it('classe la maternelle', () => {
    expect(cycleOf('PS')).toBe('maternelle');
    expect(cycleOf('GS')).toBe('maternelle');
  });
  it('classe CP1–CE1', () => {
    expect(cycleOf('CP1')).toBe('cp_ce1');
    expect(cycleOf('CE1')).toBe('cp_ce1');
  });
  it('classe CE2–CM2', () => {
    expect(cycleOf('CE2')).toBe('ce2_cm2');
    expect(cycleOf('CM2')).toBe('ce2_cm2');
  });
  it('classe le collège', () => {
    expect(cycleOf('6EME')).toBe('college');
    expect(cycleOf('3EME')).toBe('college');
  });
  it('classe le lycée', () => {
    expect(cycleOf('SECONDE')).toBe('lycee');
    expect(cycleOf('TERMINALE')).toBe('lycee');
  });
});

describe('modeGenerationOf', () => {
  it('primaire de la maternelle au CM2', () => {
    expect(modeGenerationOf('PS')).toBe('primaire');
    expect(modeGenerationOf('CM2')).toBe('primaire');
  });
  it('secondaire à partir de la 6ème', () => {
    expect(modeGenerationOf('6EME')).toBe('secondaire');
    expect(modeGenerationOf('TERMINALE')).toBe('secondaire');
  });
});

describe('classeLabel', () => {
  it('donne des libellés français lisibles', () => {
    expect(classeLabel('PS')).toBe('Petite Section');
    expect(classeLabel('CP1')).toBe('CP1');
    expect(classeLabel('6EME')).toBe('6ème');
    expect(classeLabel('TERMINALE')).toBe('Terminale');
  });
});

describe('matieresParDefaut', () => {
  it('propose des matières adaptées au cycle', () => {
    expect(matieresParDefaut('CP1')).toContain('Français');
    expect(matieresParDefaut('CP1')).toContain('Mathématiques');
    expect(matieresParDefaut('TERMINALE')).toContain('Philosophie');
    expect(matieresParDefaut('PS')).toContain('Éveil');
  });
});

describe('anneeScolaire', () => {
  it("bascule sur l'année suivante à partir d'août", () => {
    expect(anneeScolaire(new Date('2026-08-15'))).toBe('2026-2027');
    expect(anneeScolaire(new Date('2027-02-10'))).toBe('2026-2027');
    expect(anneeScolaire(new Date('2027-07-31'))).toBe('2026-2027');
    expect(anneeScolaire(new Date('2027-08-01'))).toBe('2027-2028');
  });
});
