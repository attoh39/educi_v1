import { supabase } from '../../lib/supabase';
import type { Maitrise } from '../correction/schema';

export type SkillRecord = {
  id: string;
  matiere: string;
  competence: string;
  maitrise: Maitrise;
  observations: number;
  updated_at: string;
};

export async function listerCompetences(childId: string): Promise<SkillRecord[]> {
  const { data, error } = await supabase
    .from('skill_records')
    .select('id, matiere, competence, maitrise, observations, updated_at')
    .eq('child_id', childId)
    .order('matiere')
    .order('competence');
  if (error) throw error;
  return (data ?? []) as SkillRecord[];
}
