import { fr } from '../../i18n/fr';
import type { Correction, StatutExercice } from './schema';

const BADGE: Record<StatutExercice, { texte: string; classe: string }> = {
  reussi: { texte: fr.correction.reussi, classe: 'bg-green-100 text-green-700' },
  partiel: { texte: fr.correction.partiel, classe: 'bg-amber-100 text-amber-700' },
  a_revoir: { texte: fr.correction.aRevoir, classe: 'bg-red-100 text-red-700' },
};

export function CorrectionDocument({ correction }: { correction: Correction }) {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {correction.note != null && (
          <p className="text-lg font-bold text-teal-700">
            {fr.correction.note} : {correction.note}/20
          </p>
        )}
        <p className="mt-1 text-slate-700">{correction.appreciation}</p>
      </div>
      <ul className="space-y-2">
        {correction.details.map((d, i) => {
          const badge = BADGE[d.statut];
          return (
            <li key={i} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">{d.matiere} · {d.numero}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.classe}`}>{badge.texte}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{d.explication}</p>
              <p className="mt-1 text-sm text-slate-500">{fr.correction.bonneReponse} : {d.bonneReponse}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
