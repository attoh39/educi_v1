import { supabase } from '../../lib/supabase';
import type { Devoir } from './schema';

export type DevoirGenere = { homeworkId: string; devoir: Devoir };

export class GenerationError extends Error {
  code: 'quota' | 'echec' | 'inconnu';
  constructor(code: 'quota' | 'echec' | 'inconnu') {
    super(code);
    this.code = code;
  }
}

export type SaisieDevoir =
  | { mode: 'primaire'; message: string }
  | { mode: 'secondaire'; matieres: { matiere: string; contenu: string }[] };

export async function genererDevoir(childId: string, saisie: SaisieDevoir): Promise<DevoirGenere> {
  const body = saisie.mode === 'primaire'
    ? { childId, message: saisie.message }
    : { childId, matieres: saisie.matieres };
  const { data, error } = await supabase.functions.invoke('generate-homework', { body });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 429) throw new GenerationError('quota');
    throw new GenerationError('echec');
  }
  return data as DevoirGenere;
}

export type DevoirListe = {
  id: string;
  exercices: Devoir;
  created_at: string;
};

export async function listerDevoirs(childId: string): Promise<DevoirListe[]> {
  const { data, error } = await supabase
    .from('homeworks')
    .select('id, exercices, created_at')
    .eq('child_id', childId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DevoirListe[];
}
