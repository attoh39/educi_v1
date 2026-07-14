import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fr } from '../../i18n/fr';
import type { Maitrise } from '../correction/schema';
import { listerCompetences, type SkillRecord } from './api';

const BADGE: Record<Maitrise, { texte: string; classe: string }> = {
  acquis: { texte: fr.dossier.acquis, classe: 'bg-green-100 text-green-700' },
  en_cours: { texte: fr.dossier.enCours, classe: 'bg-amber-100 text-amber-700' },
  fragile: { texte: fr.dossier.fragile, classe: 'bg-red-100 text-red-700' },
};

export function DossierPage() {
  const { childId } = useParams();
  const [records, setRecords] = useState<SkillRecord[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;
    listerCompetences(childId).then(setRecords).catch(() => setErreur(fr.commun.erreurInconnue));
  }, [childId]);

  const parMatiere = new Map<string, SkillRecord[]>();
  for (const r of records ?? []) {
    const liste = parMatiere.get(r.matiere) ?? [];
    liste.push(r);
    parMatiere.set(r.matiere, liste);
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">{fr.dossier.titre}</h2>
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</p>}
      {records === null && !erreur && <p className="text-slate-500">{fr.commun.chargement}</p>}
      {records?.length === 0 && <p className="text-slate-500">{fr.dossier.aucun}</p>}
      {[...parMatiere.entries()].map(([matiere, liste]) => (
        <div key={matiere} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 font-bold text-slate-700">{matiere}</h3>
          <ul className="space-y-2">
            {liste.map((r) => {
              const badge = BADGE[r.maitrise];
              return (
                <li key={r.id} className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">
                    {r.competence} <span className="text-slate-400">· {r.observations} {fr.dossier.observations}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.classe}`}>{badge.texte}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
