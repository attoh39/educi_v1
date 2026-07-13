import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { correctionSchema, CORRECTION_JSON_SCHEMA, profilCorrection, PROMPT_VERSION_CORRECTION } from '../_shared/correction.ts';
import { genererJson, MODELE } from '../_shared/claude.ts';

const CORRECTIONS_PAR_SEMAINE = 10;

const CYCLES: Record<string, string> = {
  PS: 'maternelle', MS: 'maternelle', GS: 'maternelle',
  CP1: 'cp_ce1', CP2: 'cp_ce1', CE1: 'cp_ce1',
  CE2: 'ce2_cm2', CM1: 'ce2_cm2', CM2: 'ce2_cm2',
  '6EME': 'college', '5EME': 'college', '4EME': 'college', '3EME': 'college',
  SECONDE: 'lycee', PREMIERE: 'lycee', TERMINALE: 'lycee',
};

function semaineIso(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const jour = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jour);
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semaine = Math.ceil(((d.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semaine).padStart(2, '0')}`;
}

function reponseJson(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { 'content-type': 'application/json' } });
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return reponseJson({ erreur: 'méthode' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization) return reponseJson({ erreur: 'non authentifié' }, 401);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return reponseJson({ erreur: 'configuration' }, 500);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return reponseJson({ erreur: 'non authentifié' }, 401);

  let corps: { submissionId?: string };
  try { corps = await req.json(); } catch { return reponseJson({ erreur: 'corps invalide' }, 400); }
  if (!corps.submissionId) return reponseJson({ erreur: 'saisie invalide' }, 400);

  const { data: sub } = await supabase.from('submissions')
    .select('id, homework_id, child_id, photo_paths')
    .eq('id', corps.submissionId).single();
  if (!sub) return reponseJson({ erreur: 'soumission introuvable' }, 404);

  const { data: hw } = await supabase.from('homeworks')
    .select('exercices, corrige, enrollment_id').eq('id', sub.homework_id).single();
  if (!hw) return reponseJson({ erreur: 'devoir introuvable' }, 404);
  const { data: enr } = await supabase.from('enrollments').select('classe').eq('id', hw.enrollment_id).single();
  const cycle = enr ? CYCLES[enr.classe as string] : undefined;
  const mode: 'primaire' | 'secondaire' = cycle === 'college' || cycle === 'lycee' ? 'secondaire' : 'primaire';

  const semaine = semaineIso(new Date());
  const { data: quota } = await supabase.from('usage_quotas').select('corrections')
    .eq('child_id', sub.child_id).eq('semaine_iso', semaine).maybeSingle();
  if ((quota?.corrections ?? 0) >= CORRECTIONS_PAR_SEMAINE) return reponseJson({ erreur: 'quota atteint' }, 429);

  // Télécharger les photos et les encoder en base64.
  const images: string[] = [];
  for (const chemin of (sub.photo_paths as string[])) {
    const { data: blob, error } = await supabase.storage.from('copies').download(chemin);
    if (error || !blob) return reponseJson({ erreur: 'lecture copie' }, 502);
    images.push(encodeBase64(new Uint8Array(await blob.arrayBuffer())));
  }
  if (images.length === 0) return reponseJson({ erreur: 'aucune copie' }, 400);

  await supabase.from('submissions').update({ statut: 'correction' }).eq('id', sub.id);

  const message = `ÉNONCÉ:\n${JSON.stringify(hw.exercices)}\n\nCORRIGÉ DE RÉFÉRENCE:\n${JSON.stringify(hw.corrige)}\n\nCorrige la copie de l'élève à partir des photos.`;
  const resultat = await genererJson({
    systeme: profilCorrection(mode), message, jsonSchema: CORRECTION_JSON_SCHEMA, apiKey, images,
    baseUrl: Deno.env.get('ANTHROPIC_BASE_URL') ?? undefined,
  });
  if (!resultat.ok) {
    await supabase.from('submissions').update({ statut: 'echec', erreur: resultat.detail }).eq('id', sub.id);
    return reponseJson({ erreur: 'correction échouée' }, 502);
  }
  const parsed = correctionSchema.safeParse(resultat.json);
  if (!parsed.success) {
    await supabase.from('submissions').update({ statut: 'echec', erreur: 'schéma invalide' }).eq('id', sub.id);
    return reponseJson({ erreur: 'correction invalide' }, 502);
  }

  const { data: correction, error: eCorr } = await supabase.from('corrections').insert({
    submission_id: sub.id, homework_id: sub.homework_id, parent_id: user.id, child_id: sub.child_id,
    note: parsed.data.note ?? null, appreciation: parsed.data.appreciation, details: parsed.data.details,
    modele: MODELE, prompt_version: PROMPT_VERSION_CORRECTION,
    cout_tokens_entree: resultat.tokensEntree, cout_tokens_sortie: resultat.tokensSortie,
  }).select('note, appreciation, details').single();
  if (eCorr || !correction) return reponseJson({ erreur: 'persistance correction' }, 500);

  await supabase.from('submissions').update({ statut: 'corrige' }).eq('id', sub.id);
  await supabase.rpc('incrementer_correction', { p_child_id: sub.child_id, p_semaine_iso: semaine });

  return reponseJson({
    note: correction.note, appreciation: correction.appreciation, details: correction.details,
  });
}

if (import.meta.main) Deno.serve(handler);
