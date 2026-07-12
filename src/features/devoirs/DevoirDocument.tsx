import { CLASSES, classeLabel, type Classe } from '../../domain/classes';
import { fr } from '../../i18n/fr';
import type { Devoir } from './schema';

const LIGNES = 'mt-2 border-b border-slate-300 leading-[2.2rem]';

function EspaceReponse({ espace }: { espace: 'lignes' | 'cadre' | 'aucun' }) {
  if (espace === 'lignes') {
    return (
      <div aria-hidden className="mt-2">
        <div className={LIGNES}>&nbsp;</div>
        <div className={LIGNES}>&nbsp;</div>
      </div>
    );
  }
  if (espace === 'cadre') {
    return <div aria-hidden className="mt-2 h-24 rounded border border-slate-300" />;
  }
  return null;
}

export function DevoirDocument(props: {
  devoir: Devoir;
  eleve: string;
  classe: Classe | string;
  date: string;
}) {
  const { devoir, eleve, classe, date } = props;
  const classeTexte = (CLASSES as readonly string[]).includes(String(classe))
    ? classeLabel(classe as Classe)
    : String(classe);
  return (
    <article className="devoir-document mx-auto max-w-[210mm] bg-white p-6 text-slate-900">
      <header className="mb-4 border-b-2 border-teal-700 pb-3">
        <h1 className="text-lg font-bold text-teal-700">{fr.app.nom}</h1>
        <dl className="mt-1 flex flex-wrap gap-x-6 text-sm">
          <div><dt className="inline font-medium">{fr.devoirs.entete.nom} : </dt><dd className="inline">{eleve}</dd></div>
          <div><dt className="inline font-medium">{fr.devoirs.entete.classe} : </dt><dd className="inline">{classeTexte}</dd></div>
          <div><dt className="inline font-medium">{fr.devoirs.entete.date} : </dt><dd className="inline">{date}</dd></div>
        </dl>
      </header>

      {devoir.matieres.map((matiere) => (
        <section key={matiere.nom} className="mb-6 break-inside-avoid">
          <h2 className="mb-2 text-base font-bold uppercase tracking-wide text-slate-700">{matiere.nom}</h2>
          <ol className="space-y-4">
            {matiere.exercices.map((ex) => (
              <li key={ex.numero} className="break-inside-avoid">
                <p className="font-medium">{ex.numero}. {ex.consigne}</p>
                {ex.items.length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1 pl-4">
                    {ex.items.map((item, i) => (
                      <li key={i} className="list-disc">{item}</li>
                    ))}
                  </ul>
                )}
                <EspaceReponse espace={ex.espaceReponse} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </article>
  );
}
