import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { correctionSchema, profilCorrection, PROMPT_VERSION_CORRECTION } from './correction.ts';

Deno.test('profilCorrection : primaire = appréciation, secondaire = note /20', () => {
  assert(profilCorrection('primaire').includes('appréciation'));
  assert(profilCorrection('secondaire').includes('20'));
});

Deno.test('correctionSchema valide une correction', () => {
  const r = correctionSchema.safeParse({ note: 12, appreciation: 'ok', details: [] });
  assert(r.success);
});

Deno.test('PROMPT_VERSION_CORRECTION défini', () => {
  assertEquals(PROMPT_VERSION_CORRECTION, 'correction-v1');
});
