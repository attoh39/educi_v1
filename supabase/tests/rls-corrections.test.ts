import { config } from 'dotenv';
config({ path: '.env.rls.local' });

import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function parentAvecSoumission(tag: string) {
  const email = `${tag}-${Date.now()}@test.educi.ci`;
  const password = 'Motdepasse!234';
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess } = await client.auth.signInWithPassword({ email, password });
  const id = sess!.user!.id;
  const { data: childId } = await client.rpc('create_child_with_enrollment', {
    p_nom: 'K', p_prenoms: 'L', p_date_naissance: '2019-03-12', p_sexe: 'M',
    p_annee_scolaire: '2026-2027', p_classe: 'CP1', p_etablissement: 'EPP',
    p_systeme: 'IVOIRIEN', p_matieres: ['Français'],
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
  return { client, id, childId: childId as string, homeworkId: hw!.id as string, submissionId: sub!.id as string };
}

describe('Isolation des corrections', () => {
  let a: Awaited<ReturnType<typeof parentAvecSoumission>>;
  let b: Awaited<ReturnType<typeof parentAvecSoumission>>;

  beforeAll(async () => {
    a = await parentAvecSoumission('xa');
    b = await parentAvecSoumission('xb');
    await a.client.from('corrections').insert({
      submission_id: a.submissionId, homework_id: a.homeworkId, parent_id: a.id, child_id: a.childId,
      note: 15, appreciation: 'Bien', details: [], modele: 'claude-sonnet-5', prompt_version: 'correction-v1',
    });
  });

  it('le parent B ne voit pas les corrections de A', async () => {
    const { data } = await b.client.from('corrections').select('*');
    expect(data).toHaveLength(0);
  });

  it('incrementer_correction crée puis incrémente sans toucher generations', async () => {
    const { data: t1 } = await a.client.rpc('incrementer_correction', { p_child_id: a.childId, p_semaine_iso: '2026-W40' });
    expect(t1).toBe(1);
    const { data: t2 } = await a.client.rpc('incrementer_correction', { p_child_id: a.childId, p_semaine_iso: '2026-W40' });
    expect(t2).toBe(2);
    const { data: q } = await a.client.from('usage_quotas').select('generations, corrections')
      .eq('child_id', a.childId).eq('semaine_iso', '2026-W40').single();
    expect(q).toMatchObject({ generations: 0, corrections: 2 });
  });

  it('B ne peut pas incrémenter le quota correction de l’enfant de A', async () => {
    const { error } = await b.client.rpc('incrementer_correction', { p_child_id: a.childId, p_semaine_iso: '2026-W41' });
    expect(error).not.toBeNull();
  });
});
