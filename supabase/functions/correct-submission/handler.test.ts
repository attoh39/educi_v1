import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handler } from './index.ts';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORRECTION_FIXE = {
  note: 15,
  appreciation: 'Bon travail, quelques erreurs.',
  details: [{ matiere: 'Français', numero: 1, statut: 'reussi', explication: 'Bien lu.', bonneReponse: 'MA' }],
};

function fauxServeurClaude(): { url: string; stop: () => void } {
  const ac = new AbortController();
  const serveur = Deno.serve({ port: 0, signal: ac.signal }, () =>
    new Response(JSON.stringify({
      stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 200 },
      content: [{ type: 'text', text: JSON.stringify(CORRECTION_FIXE) }],
    }), { headers: { 'content-type': 'application/json' } }));
  const { port } = serveur.addr as Deno.NetAddr;
  return { url: `http://127.0.0.1:${port}`, stop: () => ac.abort() };
}

async function parentAvecSoumission() {
  const email = `corr-${crypto.randomUUID()}@test.educi.ci`;
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
  const chemin = `${id}/${childId}/${hw!.id}/p1.jpg`;
  await client.storage.from('copies').upload(chemin, new Blob(['img'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
  const { data: sub } = await client.from('submissions').insert({
    parent_id: id, child_id: childId, homework_id: hw!.id, photo_paths: [chemin],
  }).select('id').single();
  return { token: sess!.session!.access_token, submissionId: sub!.id as string, client, childId };
}

Deno.test('corrige une soumission et persiste la correction', async () => {
  const faux = fauxServeurClaude();
  Deno.env.set('ANTHROPIC_API_KEY', 'test');
  Deno.env.set('ANTHROPIC_BASE_URL', faux.url);
  try {
    const { token, submissionId, client } = await parentAvecSoumission();
    const req = new Request('http://local/correct-submission', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ submissionId }),
    });
    const res = await handler(req);
    assertEquals(res.status, 200);
    const corps = await res.json();
    assertEquals(corps.appreciation, 'Bon travail, quelques erreurs.');
    const { data: sub } = await client.from('submissions').select('statut').eq('id', submissionId).single();
    assertEquals(sub!.statut, 'corrige');
  } finally {
    faux.stop();
  }
});

Deno.test('refuse une saisie sans submissionId', async () => {
  const { token } = await parentAvecSoumission();
  const req = new Request('http://local/correct-submission', {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  assertEquals((await handler(req)).status, 400);
});
