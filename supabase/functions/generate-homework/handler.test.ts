// Test d'intégration : faux serveur Claude local + Supabase local réel.
// Prérequis : stack Supabase démarrée ; variables ci-dessous renseignées.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handler } from './index.ts';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DEVOIR_FIXE = {
  matieres: [{
    nom: 'Français',
    exercices: [{ numero: 1, consigne: 'Lis MA, ME, MI.', type: 'ecriture', items: ['MA', 'ME', 'MI'], espaceReponse: 'lignes' }],
  }],
  corrige: [{ matiere: 'Français', numero: 1, reponse: 'MA ME MI', explication: 'Syllabes en M.' }],
};

function fauxServeurClaude(): { url: string; stop: () => void } {
  const ac = new AbortController();
  const serveur = Deno.serve({ port: 0, signal: ac.signal }, () =>
    new Response(JSON.stringify({
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 200 },
      content: [{ type: 'text', text: JSON.stringify(DEVOIR_FIXE) }],
    }), { headers: { 'content-type': 'application/json' } }),
  );
  const { port } = serveur.addr as Deno.NetAddr;
  return { url: `http://127.0.0.1:${port}`, stop: () => ac.abort() };
}

async function parentAvecEnfant() {
  const email = `hw-${crypto.randomUUID()}@test.educi.ci`;
  const password = 'Motdepasse!234';
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await client.auth.signInWithPassword({ email, password });
  const { data: childId } = await client.rpc('create_child_with_enrollment', {
    p_nom: 'K', p_prenoms: 'L', p_date_naissance: '2019-03-12', p_sexe: 'M',
    p_annee_scolaire: '2026-2027', p_classe: 'CP1', p_etablissement: 'EPP',
    p_systeme: 'IVOIRIEN', p_matieres: ['Français'],
  });
  return { token: data!.session!.access_token, childId: childId as string };
}

Deno.test('génère et persiste un devoir pour un enfant du primaire', async () => {
  const faux = fauxServeurClaude();
  Deno.env.set('ANTHROPIC_API_KEY', 'test');
  Deno.env.set('ANTHROPIC_BASE_URL', faux.url);
  try {
    const { token, childId } = await parentAvecEnfant();
    const req = new Request('http://local/generate-homework', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ childId, message: 'Français : les syllabes MA ME MI' }),
    });
    const res = await handler(req);
    assertEquals(res.status, 200);
    const corps = await res.json();
    assertEquals(corps.devoir.matieres[0].nom, 'Français');
  } finally {
    faux.stop();
  }
});

Deno.test('refuse une saisie trop courte', async () => {
  const { token, childId } = await parentAvecEnfant();
  const req = new Request('http://local/generate-homework', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ childId, message: 'x' }),
  });
  const res = await handler(req);
  assertEquals(res.status, 400);
});
