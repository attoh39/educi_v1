import { supabase } from '../../lib/supabase';

export type Soumission = {
  id: string;
  homework_id: string;
  photo_paths: string[];
  statut: string;
  created_at: string;
};

export async function televerserCopie(chemin: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from('copies').upload(chemin, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
}

export async function creerSoumission(
  homeworkId: string,
  childId: string,
  photoPaths: string[],
): Promise<Soumission> {
  const { data: userData } = await supabase.auth.getUser();
  const parentId = userData.user!.id;
  const { data, error } = await supabase
    .from('submissions')
    .insert({
      parent_id: parentId, child_id: childId, homework_id: homeworkId,
      photo_paths: photoPaths, statut: 'envoye',
    })
    .select('id, homework_id, photo_paths, statut, created_at')
    .single();
  if (error) throw error;
  return data as Soumission;
}

export async function listerSoumissions(homeworkId: string): Promise<Soumission[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('id, homework_id, photo_paths, statut, created_at')
    .eq('homework_id', homeworkId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Soumission[];
}
