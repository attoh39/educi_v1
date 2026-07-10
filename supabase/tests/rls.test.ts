import { config } from 'dotenv';
config({ path: '.env.rls.local' });

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function nouveauParent(tag: string): Promise<{ client: SupabaseClient; id: string }> {
  const email = `${tag}-${Date.now()}@test.educi.ci`;
  const password = 'Motdepasse!234';
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createError) throw createError;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client, id: data.user.id };
}

describe('Isolation RLS entre parents', () => {
  let parentA: { client: SupabaseClient; id: string };
  let parentB: { client: SupabaseClient; id: string };
  let childAId: string;

  beforeAll(async () => {
    parentA = await nouveauParent('a');
    parentB = await nouveauParent('b');
    const { data, error } = await parentA.client.rpc('create_child_with_enrollment', {
      p_nom: 'Kouassi', p_prenoms: 'Lamine', p_date_naissance: '2019-03-12',
      p_sexe: 'M', p_annee_scolaire: '2026-2027', p_classe: 'CP1',
      p_etablissement: 'EPP Cocody', p_systeme: 'IVOIRIEN',
      p_matieres: ['Français', 'Mathématiques'],
    });
    if (error) throw error;
    childAId = data as string;
  });

  it('le trigger crée la ligne parents à l’inscription', async () => {
    const { data } = await parentA.client.from('parents').select('id');
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(parentA.id);
  });

  it('le parent A voit son enfant et son inscription', async () => {
    const { data } = await parentA.client
      .from('children').select('*, enrollments(*)');
    expect(data).toHaveLength(1);
    expect(data![0].enrollments).toHaveLength(1);
  });

  it('le parent B ne voit pas les enfants du parent A', async () => {
    const { data } = await parentB.client.from('children').select('*');
    expect(data).toHaveLength(0);
  });

  it('le parent B ne peut pas insérer un enfant chez le parent A', async () => {
    const { error } = await parentB.client.from('children').insert({
      parent_id: parentA.id, nom: 'X', prenoms: 'Y',
      date_naissance: '2018-01-01', sexe: 'F',
    });
    expect(error).not.toBeNull();
  });

  it('le parent B ne peut ni modifier ni supprimer l’enfant du parent A', async () => {
    await parentB.client.from('children').update({ nom: 'Piraté' }).eq('id', childAId);
    await parentB.client.from('children').delete().eq('id', childAId);
    const { data } = await parentA.client.from('children').select('nom').eq('id', childAId);
    expect(data).toHaveLength(1);
    expect(data![0].nom).toBe('Kouassi');
  });

  it('le parent B ne voit pas le profil parents du parent A', async () => {
    const { data } = await parentB.client.from('parents').select('id');
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(parentB.id);
  });

  it('deux inscriptions actives pour le même enfant sont refusées', async () => {
    const { error } = await parentA.client.from('enrollments').insert({
      child_id: childAId, parent_id: parentA.id, annee_scolaire: '2027-2028',
      classe: 'CP2', etablissement: 'EPP Cocody', systeme: 'IVOIRIEN',
      matieres: ['Français'],
    });
    expect(error).not.toBeNull(); // index unique one_active_enrollment_per_child
  });

  it('le parent B ne peut pas rattacher une inscription à l’enfant du parent A', async () => {
    const { error } = await parentB.client.from('enrollments').insert({
      child_id: childAId, parent_id: parentB.id, annee_scolaire: '2026-2027',
      classe: 'CP1', etablissement: 'EPP Yop', systeme: 'IVOIRIEN',
      matieres: ['Français'],
    });
    expect(error).not.toBeNull(); // WITH CHECK durci : child_id doit appartenir au parent
  });
});
