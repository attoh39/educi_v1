import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fr } from '../../i18n/fr';
import { listerDevoirs, type DevoirListe } from './api';

export function DevoirsPage() {
  const { childId } = useParams();
  const [devoirs, setDevoirs] = useState<DevoirListe[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;
    listerDevoirs(childId)
      .then(setDevoirs)
      .catch(() => setErreur(fr.commun.erreurInconnue));
  }, [childId]);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">{fr.copies.devoirsTitre}</h2>
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</p>}
      {devoirs === null && !erreur && <p className="text-slate-500">{fr.commun.chargement}</p>}
      {devoirs?.length === 0 && <p className="text-slate-500">{fr.copies.aucunDevoir}</p>}
      <ul className="space-y-2">
        {devoirs?.map((d) => (
          <li key={d.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <span className="text-sm text-slate-600">
              {new Date(d.created_at).toLocaleDateString('fr-FR')}
            </span>
            <Link
              to={`/enfants/${childId}/devoirs/${d.id}/copies`}
              className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white"
            >
              {fr.copies.envoyerCopies}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
