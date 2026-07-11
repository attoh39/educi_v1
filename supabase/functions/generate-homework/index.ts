import { createClient } from 'npm:@supabase/supabase-js@2';
import { devoirSchema, DEVOIR_JSON_SCHEMA } from '../_shared/devoir.ts';
import { profilPourCycle, PROMPT_VERSION } from '../_shared/profils.ts';
import { genererJson, MODELE } from '../_shared/claude.ts';

const GENERATIONS_PAR_SEMAINE = 10;

function semaineIso(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const jour = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jour);
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semaine = Math.ceil(((d.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semaine).padStart(2, '0')}`;
}

function reponseJson(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });
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

  let corps: { childId?: string; message?: string };
  try {
    corps = await req.json();
  } catch {
    return reponseJson({ erreur: 'corps invalide' }, 400);
  }
  const message = (corps.message ?? '').trim();
  if (!corps.childId || message.length < 3) {
    return reponseJson({ erreur: 'saisie invalide' }, 400);
  }

  // Inscription active de l'enfant (RLS garantit l'appartenance au parent).
  const { data: enr } = await supabase
    .from('enrollments')
    .select('id, classe')
    .eq('child_id', corps.childId)
    .eq('is_active', true)
    .single();
  if (!enr) return reponseJson({ erreur: 'enfant introuvable' }, 404);

  const cycles: Record<string, string> = {
    PS: 'maternelle', MS: 'maternelle', GS: 'maternelle',
    CP1: 'cp_ce1', CP2: 'cp_ce1', CE1: 'cp_ce1',
    CE2: 'ce2_cm2', CM1: 'ce2_cm2', CM2: 'ce2_cm2',
  };
  const cycle = cycles[enr.classe as string];
  const profil = cycle ? profilPourCycle(cycle) : null;
  if (!profil) return reponseJson({ erreur: 'niveau non pris en charge' }, 400);

  // Vérification du quota (sans incrémenter).
  const semaine = semaineIso(new Date());
  const { data: quota } = await supabase
    .from('usage_quotas')
    .select('generations')
    .eq('child_id', corps.childId)
    .eq('semaine_iso', semaine)
    .maybeSingle();
  if ((quota?.generations ?? 0) >= GENERATIONS_PAR_SEMAINE) {
    return reponseJson({ erreur: 'quota atteint' }, 429);
  }

  // Trace de la demande.
  const { data: request, error: eReq } = await supabase
    .from('homework_requests')
    .insert({
      parent_id: user.id, child_id: corps.childId, enrollment_id: enr.id,
      mode: 'primaire', contenu: { message }, statut: 'generation',
    })
    .select('id')
    .single();
  if (eReq || !request) return reponseJson({ erreur: 'création demande' }, 500);

  const resultat = await genererJson({
    systeme: profil.texte,
    message,
    jsonSchema: DEVOIR_JSON_SCHEMA,
    apiKey,
    baseUrl: Deno.env.get('ANTHROPIC_BASE_URL') ?? undefined,
  });

  if (!resultat.ok) {
    await supabase.from('homework_requests')
      .update({ statut: 'echec', erreur: resultat.detail })
      .eq('id', request.id);
    return reponseJson({ erreur: 'génération échouée', requestId: request.id }, 502);
  }

  const parsed = devoirSchema.safeParse(resultat.json);
  if (!parsed.success) {
    await supabase.from('homework_requests')
      .update({ statut: 'echec', erreur: 'schéma invalide' })
      .eq('id', request.id);
    return reponseJson({ erreur: 'génération invalide', requestId: request.id }, 502);
  }

  const { data: devoir, error: eHw } = await supabase
    .from('homeworks')
    .insert({
      request_id: request.id, parent_id: user.id, child_id: corps.childId,
      enrollment_id: enr.id,
      exercices: { matieres: parsed.data.matieres },
      corrige: parsed.data.corrige,
      profil: profil.cle, prompt_version: PROMPT_VERSION, modele: MODELE,
      cout_tokens_entree: resultat.tokensEntree, cout_tokens_sortie: resultat.tokensSortie,
    })
    .select('id, exercices')
    .single();
  if (eHw || !devoir) return reponseJson({ erreur: 'persistance devoir' }, 500);

  await supabase.from('homework_requests').update({ statut: 'pret' }).eq('id', request.id);
  await supabase.rpc('incrementer_quota', { p_child_id: corps.childId, p_semaine_iso: semaine });

  return reponseJson({ homeworkId: devoir.id, devoir: devoir.exercices });
}

if (import.meta.main) Deno.serve(handler);
