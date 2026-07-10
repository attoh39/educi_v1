export const CLASSES = [
  'PS', 'MS', 'GS',
  'CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2',
  '6EME', '5EME', '4EME', '3EME',
  'SECONDE', 'PREMIERE', 'TERMINALE',
] as const;

export type Classe = (typeof CLASSES)[number];
export type Cycle = 'maternelle' | 'cp_ce1' | 'ce2_cm2' | 'college' | 'lycee';
export type ModeGeneration = 'primaire' | 'secondaire';
/** Phase 1A is intentionally single-system (Ivorian curriculum); multi-system
 *  support will require dispatching CLASSES/CYCLES/MATIERES by Systeme. */
export type Systeme = 'IVOIRIEN' | 'FRANCAIS' | 'AUTRE';

const CYCLES: Record<Classe, Cycle> = {
  PS: 'maternelle', MS: 'maternelle', GS: 'maternelle',
  CP1: 'cp_ce1', CP2: 'cp_ce1', CE1: 'cp_ce1',
  CE2: 'ce2_cm2', CM1: 'ce2_cm2', CM2: 'ce2_cm2',
  '6EME': 'college', '5EME': 'college', '4EME': 'college', '3EME': 'college',
  SECONDE: 'lycee', PREMIERE: 'lycee', TERMINALE: 'lycee',
};

export function cycleOf(classe: Classe): Cycle {
  return CYCLES[classe];
}

export function modeGenerationOf(classe: Classe): ModeGeneration {
  const cycle = cycleOf(classe);
  return cycle === 'college' || cycle === 'lycee' ? 'secondaire' : 'primaire';
}

const LABELS: Record<Classe, string> = {
  PS: 'Petite Section', MS: 'Moyenne Section', GS: 'Grande Section',
  CP1: 'CP1', CP2: 'CP2', CE1: 'CE1', CE2: 'CE2', CM1: 'CM1', CM2: 'CM2',
  '6EME': '6ème', '5EME': '5ème', '4EME': '4ème', '3EME': '3ème',
  SECONDE: 'Seconde', PREMIERE: 'Première', TERMINALE: 'Terminale',
};

export function classeLabel(classe: Classe): string {
  return LABELS[classe];
}

const MATIERES: Record<Cycle, string[]> = {
  maternelle: ['Éveil', 'Langage', 'Graphisme', 'Motricité'],
  cp_ce1: ['Français', 'Mathématiques', 'EDHC', 'Éveil au milieu'],
  ce2_cm2: ['Français', 'Mathématiques', 'Histoire-Géographie', 'Sciences', 'EDHC'],
  college: [
    'Français', 'Mathématiques', 'Anglais', 'SVT', 'Physique-Chimie',
    'Histoire-Géographie', 'EDHC',
  ],
  lycee: [
    'Français', 'Mathématiques', 'Anglais', 'SVT', 'Physique-Chimie',
    'Histoire-Géographie', 'Philosophie', 'Informatique',
  ],
};

export function matieresParDefaut(classe: Classe): string[] {
  return [...MATIERES[cycleOf(classe)]];
}

/** Année scolaire ivoirienne : bascule au 1er août. */
export function anneeScolaire(date: Date): string {
  const y = date.getFullYear();
  return date.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
