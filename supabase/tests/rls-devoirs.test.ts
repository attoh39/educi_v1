import { config } from 'dotenv';
config({ path: '.env.rls.local' });

import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function nouveauParentAvecEnfant(tag: string) {
  const email = `${tag}-${Date.now()}@test.educi.ci`;
  const password = 'Motdepasse!234';
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { error: e1 } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (e1) throw e1;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data: childId, error: e2 } = await client.rpc('create_child_with_enrollment', {
    p_nom: 'Kouassi', p_prenoms: 'Lamine', p_date_naissance: '2019-03-12', p_sexe: 'M',
    p_annee_scolaire: '2026-2027', p_classe: 'CP1', p_etablissement: 'EPP Cocody',
    p_systeme: 'IVOIRIEN', p_matieres: ['Français'],
  });
  if (e2) throw e2;
  const { data: enr } = await client.from('enrollments').select('id').eq('child_id', childId).single();
  return { client, id: data.user.id, childId: childId as string, enrollmentId: enr!.id as string };
}

describe('Isolation RLS des devoirs', () => {
  let a: Awaited<ReturnType<typeof nouveauParentAvecEnfant>>;
  let b: Awaited<ReturnType<typeof nouveauParentAvecEnfant>>;
  let requestAId: string;

  beforeAll(async () => {
    a = await nouveauParentAvecEnfant('da');
    b = await nouveauParentAvecEnfant('db');
    const { data, error } = await a.client.from('homework_requests').insert({
      parent_id: a.id, child_id: a.childId, enrollment_id: a.enrollmentId,
      mode: 'primaire', contenu: { message: 'Français : syllabes MA ME MI' },
    }).select('id').single();
    if (error) throw error;
    requestAId = data.id;
  });

  it('le parent B ne voit pas les demandes du parent A', async () => {
    const { data } = await b.client.from('homework_requests').select('*');
    expect(data).toHaveLength(0);
  });

  it('le parent B ne peut pas insérer une demande chez le parent A', async () => {
    const { error } = await b.client.from('homework_requests').insert({
      parent_id: a.id, child_id: a.childId, enrollment_id: a.enrollmentId,
      mode: 'primaire', contenu: { message: 'x' },
    });
    expect(error).not.toBeNull();
  });

  it('incrementer_quota crée puis incrémente pour le bon parent', async () => {
    const { data: t1, error: e1 } = await a.client.rpc('incrementer_quota', {
      p_child_id: a.childId, p_semaine_iso: '2026-W37',
    });
    expect(e1).toBeNull();
    expect(t1).toBe(1);
    const { data: t2 } = await a.client.rpc('incrementer_quota', {
      p_child_id: a.childId, p_semaine_iso: '2026-W37',
    });
    expect(t2).toBe(2);
  });

  it('le parent B ne voit pas les quotas du parent A', async () => {
    const { data } = await b.client.from('usage_quotas').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('le parent B ne voit pas le devoir du parent A', async () => {
    // le parent A crée un homework lié à sa request
    await a.client.from('homeworks').insert({
      request_id: requestAId, parent_id: a.id, child_id: a.childId,
      enrollment_id: a.enrollmentId, exercices: { matieres: [] }, corrige: [],
      profil: 'cp_ce1', prompt_version: 'v1', modele: 'claude-sonnet-5',
    });
    const { data } = await b.client.from('homeworks').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it("le parent B ne peut pas squatter le quota de l'enfant du parent A", async () => {
    const { error } = await b.client.rpc('incrementer_quota', {
      p_child_id: a.childId, p_semaine_iso: '2026-W40',
    });
    expect(error).not.toBeNull(); // WITH CHECK durci : child_id doit appartenir à B
  });
});
