import { describe, expect, it } from 'vitest';
import { GENERATIONS_PAR_SEMAINE, semaineIso } from './semaine';

describe('semaineIso', () => {
  it('formate en AAAA-Www (semaine ISO, lundi comme premier jour)', () => {
    expect(semaineIso(new Date('2026-01-01'))).toBe('2026-W01'); // jeudi → semaine 1
    expect(semaineIso(new Date('2026-09-10'))).toBe('2026-W37');
    expect(semaineIso(new Date('2027-01-04'))).toBe('2027-W01'); // lundi
  });
  it('rattache les premiers jours de janvier à la dernière semaine de l’année précédente si besoin', () => {
    expect(semaineIso(new Date('2027-01-01'))).toBe('2026-W53'); // vendredi → semaine ISO 53 de 2026
  });
});

describe('GENERATIONS_PAR_SEMAINE', () => {
  it('définit un quota de lancement strictement positif', () => {
    expect(GENERATIONS_PAR_SEMAINE).toBeGreaterThan(0);
  });
});
