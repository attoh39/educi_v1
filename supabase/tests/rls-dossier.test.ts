import { config } from 'dotenv';
config({ path: '.env.rls.local' });

import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function parentAvecCorrection(tag: string) {
  const email = `${tag}-${Date.now()}@test.educi.ci`;
  const password = 'Motdepasse!234';
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess } = await client.auth.signInWithPassword({ email, password });
  const id = sess!.user!.id;
  const { data: childId } = await client.rpc('create_child_with_enrollment', {
    p_nom: 'K', p_prenoms: 'L', p_date_naissance: '2019-03-12', p_sexe: 'M',
    p_annee_scolaire: '2026-2027', p_classe: 'CP1', p_etablissement: 'EPP', p_systeme: 'IVOIRIEN', p_matieres: ['Français'],
  });
  const enrollmentId = (await client.from('enrollments').select('id').eq('child_id', childId).single()).data!.id;
  const { data: req } = await client.from('homework_requests').insert({
    parent_id: id, child_id: childId, enrollment_id: enrollmentId, mode: 'primaire', contenu: { message: 'x' },
  }).select('id').single();
  const { data: hw } = await client.from('homeworks').insert({
    request_id: req!.id, parent_id: id, child_id: childId, enrollment_id: enrollmentId,
    exercices: { matieres: [] }, corrige: [], profil: 'cp_ce1', prompt_version: 'v1', modele: 'claude-sonnet-5',
  }).select('id').single();
  const { data: sub } = await client.from('submissions').insert({
    parent_id: id, child_id: childId, homework_id: hw!.id, photo_paths: [`${id}/x/y/z.jpg`],
  }).select('id').single();
  const { data: corr } = await client.from('corrections').insert({
    submission_id: sub!.id, homework_id: hw!.id, parent_id: id, child_id: childId,
    appreciation: 'ok', details: [], modele: 'claude-sonnet-5', prompt_version: 'correction-v2',
  }).select('id').single();
  return { client, id, childId: childId as string, correctionId: corr!.id as string };
}

describe('Isolation du dossier pédagogique', () => {
  let a: Awaited<ReturnType<typeof parentAvecCorrection>>;
  let b: Awaited<ReturnType<typeof parentAvecCorrection>>;

  beforeAll(async () => {
    a = await parentAvecCorrection('sa');
    b = await parentAvecCorrection('sb');
  });

  it('enregistrer_competence crée un event et upsert le record (observations incrémentées)', async () => {
    await a.client.rpc('enregistrer_competence', {
      p_child_id: a.childId, p_correction_id: a.correctionId, p_matiere: 'Français', p_competence: 'syllabes', p_maitrise: 'en_cours',
    });
    await a.client.rpc('enregistrer_competence', {
      p_child_id: a.childId, p_correction_id: a.correctionId, p_matiere: 'Français', p_competence: 'syllabes', p_maitrise: 'acquis',
    });
    const { data: rec } = await a.client.from('skill_records').select('maitrise, observations')
      .eq('child_id', a.childId).eq('matiere', 'Français').eq('competence', 'syllabes').single();
    expect(rec).toMatchObject({ maitrise: 'acquis', observations: 2 });
    const { data: evts } = await a.client.from('skill_events').select('id').eq('child_id', a.childId);
    expect(evts).toHaveLength(2);
  });

  it('le parent B ne voit pas le dossier de A', async () => {
    const { data: rec } = await b.client.from('skill_records').select('*');
    expect(rec).toHaveLength(0);
    const { data: evt } = await b.client.from('skill_events').select('*');
    expect(evt).toHaveLength(0);
  });

  it('B ne peut pas enregistrer une compétence pour l’enfant de A', async () => {
    const { error } = await b.client.rpc('enregistrer_competence', {
      p_child_id: a.childId, p_correction_id: a.correctionId, p_matiere: 'Français', p_competence: 'x', p_maitrise: 'acquis',
    });
    expect(error).not.toBeNull();
  });
});
