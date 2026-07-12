// Appel HTTP direct à l'API Messages de Claude (Sonnet 5).
// Choix HTTP (plutôt que SDK) : contrôle total du corps, aucune surprise de
// typage du SDK sous Deno. output_config.format force un JSON conforme au schéma.
export const MODELE = 'claude-sonnet-5';

export type ResultatClaude =
  | { ok: true; json: unknown; tokensEntree: number; tokensSortie: number }
  | { ok: false; raison: 'refus' | 'tronque' | 'http' | 'json'; detail: string };

export async function genererJson(params: {
  systeme: string;
  message: string;
  jsonSchema: unknown;
  apiKey: string;
  baseUrl?: string; // surchargé par les tests pour pointer un faux serveur
}): Promise<ResultatClaude> {
  const base = params.baseUrl ?? 'https://api.anthropic.com';
  let reponse: Response;
  try {
    reponse = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELE,
        max_tokens: 8000,
        thinking: { type: 'disabled' },
        system: [
          { type: 'text', text: params.systeme, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: params.message }],
        output_config: {
          // Pas de champ "name" : l'API n'accepte que { type, schema } pour
          // output_config.format (vérifié via la doc structured-outputs).
          format: { type: 'json_schema', schema: params.jsonSchema },
        },
      }),
    });
  } catch (e) {
    return { ok: false, raison: 'http', detail: String(e) };
  }

  if (!reponse.ok) {
    return { ok: false, raison: 'http', detail: `HTTP ${reponse.status}` };
  }
  const data = await reponse.json();
  if (data.stop_reason === 'refusal') {
    return { ok: false, raison: 'refus', detail: data.stop_details?.explanation ?? 'refus' };
  }
  if (data.stop_reason === 'max_tokens') {
    return { ok: false, raison: 'tronque', detail: 'sortie tronquée (max_tokens)' };
  }
  const bloc = Array.isArray(data.content)
    ? data.content.find((b: { type: string }) => b.type === 'text')
    : null;
  if (!bloc?.text) {
    return { ok: false, raison: 'json', detail: 'aucun bloc texte' };
  }
  try {
    return {
      ok: true,
      json: JSON.parse(bloc.text),
      tokensEntree: data.usage?.input_tokens ?? 0,
      tokensSortie: data.usage?.output_tokens ?? 0,
    };
  } catch {
    return { ok: false, raison: 'json', detail: 'JSON invalide' };
  }
}
