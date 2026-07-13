import { config } from 'dotenv';
config({ path: '.env.rls.local' });

import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function parentAvecDevoir(tag: string) {
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
    parent_id: id, child_id: childId, mode: 'primaire', contenu: { message: 'x' },
    enrollment_id: enrollmentId,
  }).select('id').single();
  const { data: hw } = await client.from('homeworks').insert({
    request_id: req!.id, parent_id: id, child_id: childId, enrollment_id: enrollmentId,
    exercices: { matieres: [] }, corrige: [], profil: 'cp_ce1', prompt_version: 'v1', modele: 'claude-sonnet-5',
  }).select('id').single();
  return { client, id, childId: childId as string, homeworkId: hw!.id as string };
}

describe('Isolation des copies', () => {
  let a: Awaited<ReturnType<typeof parentAvecDevoir>>;
  let b: Awaited<ReturnType<typeof parentAvecDevoir>>;

  beforeAll(async () => {
    a = await parentAvecDevoir('ca');
    b = await parentAvecDevoir('cb');
    await a.client.from('submissions').insert({
      parent_id: a.id, child_id: a.childId, homework_id: a.homeworkId, photo_paths: [`${a.id}/x/y/z.jpg`],
    });
  });

  it('le parent B ne voit pas les soumissions du parent A', async () => {
    const { data } = await b.client.from('submissions').select('*');
    expect(data).toHaveLength(0);
  });

  it('le parent B ne peut pas insérer une soumission chez A', async () => {
    const { error } = await b.client.from('submissions').insert({
      parent_id: a.id, child_id: a.childId, homework_id: a.homeworkId, photo_paths: [],
    });
    expect(error).not.toBeNull();
  });

  it('un parent téléverse sous son préfixe et se relit', async () => {
    const blob = new Blob(['img'], { type: 'image/jpeg' });
    const chemin = `${a.id}/${a.childId}/${a.homeworkId}/p1.jpg`;
    const up = await a.client.storage.from('copies').upload(chemin, blob, { contentType: 'image/jpeg' });
    expect(up.error).toBeNull();
    const list = await a.client.storage.from('copies').list(`${a.id}/${a.childId}/${a.homeworkId}`);
    expect(list.data?.some((f) => f.name === 'p1.jpg')).toBe(true);
  });

  it('le parent B ne peut ni lister ni téléverser sous le préfixe de A', async () => {
    const listB = await b.client.storage.from('copies').list(`${a.id}/${a.childId}/${a.homeworkId}`);
    expect(listB.data ?? []).toHaveLength(0);
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const up = await b.client.storage.from('copies').upload(`${a.id}/pirate.jpg`, blob, { contentType: 'image/jpeg' });
    expect(up.error).not.toBeNull();
  });
});
