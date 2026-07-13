import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { profilSecondaire, PROMPT_VERSION_SECONDAIRE } from './profils.ts';

Deno.test('profilSecondaire assemble préambule + règles des matières présentes', () => {
  const p = profilSecondaire('college', ['Mathématiques', 'Français']);
  assert(p);
  assertEquals(p.cle, 'college');
  assert(p.texte.includes('collège'));
  assert(p.texte.includes('Mathématiques'));
  assert(p.texte.includes('Français'));
});

Deno.test('profilSecondaire : matière sans règle dédiée retombe sur le préambule', () => {
  const p = profilSecondaire('lycee', ['MatièreInconnue']);
  assert(p);
  assert(p.texte.includes('lycée'));
});

Deno.test('profilSecondaire retourne null hors collège/lycée', () => {
  assertEquals(profilSecondaire('cp_ce1', ['Français']), null);
});

Deno.test('PROMPT_VERSION_SECONDAIRE est distinct', () => {
  assertEquals(PROMPT_VERSION_SECONDAIRE, 'secondaire-v1');
});
