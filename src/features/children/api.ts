import { supabase } from '../../lib/supabase';
import type { EnfantFormValues } from './schema';

export type EnfantAvecInscription = {
  id: string;
  nom: string;
  prenoms: string;
  date_naissance: string;
  sexe: string;
  enrollments: {
    id: string;
    annee_scolaire: string;
    classe: string;
    etablissement: string;
    matieres: string[];
    is_active: boolean;
  }[];
};

export async function creerEnfant(
  valeurs: EnfantFormValues,
  anneeScolaire: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_child_with_enrollment', {
    p_nom: valeurs.nom,
    p_prenoms: valeurs.prenoms,
    p_date_naissance: valeurs.dateNaissance,
    p_sexe: valeurs.sexe,
    p_annee_scolaire: anneeScolaire,
    p_classe: valeurs.classe,
    p_etablissement: valeurs.etablissement,
    p_systeme: valeurs.systeme,
    p_matieres: valeurs.matieres,
  });
  if (error) throw error;
  return data as string;
}

export async function listerEnfants(): Promise<EnfantAvecInscription[]> {
  const { data, error } = await supabase
    .from('children')
    .select('*, enrollments(*)')
    .eq('enrollments.is_active', true)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as EnfantAvecInscription[];
}
