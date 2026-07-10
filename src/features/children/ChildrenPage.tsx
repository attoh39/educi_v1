import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { classeLabel, type Classe } from '../../domain/classes';
import { fr } from '../../i18n/fr';
import { listerEnfants, type EnfantAvecInscription } from './api';

export function ChildrenPage() {
  const [enfants, setEnfants] = useState<EnfantAvecInscription[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerEnfants()
      .then(setEnfants)
      .catch(() => setErreur(fr.commun.erreurInconnue));
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">{fr.enfants.titre}</h2>
        <Link to="/enfants/nouveau"
          className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white">
          {fr.enfants.ajouter}
        </Link>
      </div>

      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</p>}
      {enfants === null && !erreur && <p className="text-slate-500">{fr.commun.chargement}</p>}
      {enfants?.length === 0 && <p className="text-slate-500">{fr.enfants.aucun}</p>}

      <ul className="space-y-2">
        {enfants?.map((e) => {
          const inscription = e.enrollments[0];
          return (
            <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-800">{e.prenoms} {e.nom}</p>
              {inscription && (
                <p className="text-sm text-slate-500">
                  {classeLabel(inscription.classe as Classe)} · {inscription.etablissement} · {inscription.annee_scolaire}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
