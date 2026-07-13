import { useRef, useState, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import { fr } from '../../i18n/fr';
import { useAuth } from '../auth/AuthProvider';
import { compresserImage } from './compression';
import { envoyerElements } from './envoi';
import { creerSoumission, corrigerSoumission, CorrectionError } from './api';
import type { ElementFile } from './copiesQueue';
import { CorrectionDocument } from '../correction/CorrectionDocument';
import type { Correction } from '../correction/schema';

type Etat = 'saisie' | 'envoi' | 'partiel' | 'envoye' | 'correction' | 'corrige';

export function CaptureCopiesPage() {
  const { childId, homeworkId } = useParams();
  const { session } = useAuth();
  const parentId = session?.user.id ?? '';
  const [elements, setElements] = useState<ElementFile[]>([]);
  const [etat, setEtat] = useState<Etat>('saisie');
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const enVol = useRef(false);

  async function onAjout(e: ChangeEvent<HTMLInputElement>) {
    const fichiers = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const f of fichiers) {
      const blob = await compresserImage(f);
      setElements((prev) => [...prev, { id: crypto.randomUUID(), blob }]);
    }
  }

  async function onEnvoi() {
    if (enVol.current || !childId || !homeworkId || elements.length === 0) return;
    enVol.current = true;
    setEtat('envoi');
    const { envoyes, echoues } = await envoyerElements(parentId, childId, homeworkId, elements);
    if (echoues.length > 0 || envoyes.length === 0) {
      setEtat('partiel');
      enVol.current = false;
      return;
    }
    const soumission = await creerSoumission(homeworkId, childId, envoyes);
    setSubmissionId(soumission.id);
    setElements([]);
    setEtat('envoye');
    enVol.current = false;
  }

  async function onCorrection() {
    if (enVol.current || !submissionId) return;
    enVol.current = true;
    setEtat('correction');
    setErreur(null);
    try {
      const c = await corrigerSoumission(submissionId);
      setCorrection(c);
      setEtat('corrige');
    } catch (err) {
      setErreur(err instanceof CorrectionError && err.code === 'quota' ? fr.correction.quotaAtteint : fr.correction.echec);
      setEtat('envoye');
    } finally {
      enVol.current = false;
    }
  }

  if (etat === 'corrige' && correction) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">{fr.correction.titre}</h2>
        <CorrectionDocument correction={correction} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">{fr.copies.captureTitre}</h2>

      {etat === 'envoye' || etat === 'correction' ? (
        <>
          <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{fr.copies.envoiReussi}</p>
          {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</p>}
          <button type="button" onClick={onCorrection} disabled={etat === 'correction'}
            className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50">
            {etat === 'correction' ? fr.correction.enCours : fr.correction.lancer}
          </button>
        </>
      ) : (
        <>
          <label className="block">
            <span className="inline-block rounded-lg bg-teal-600 px-4 py-3 font-semibold text-white">{fr.copies.ajouterPhoto}</span>
            <input type="file" accept="image/*" capture="environment" multiple onChange={onAjout} className="sr-only" aria-label={fr.copies.ajouterPhoto} />
          </label>
          <p className="text-sm text-slate-600">{elements.length} {fr.copies.enFile}</p>
          {etat === 'partiel' && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{fr.copies.envoiPartiel}</p>}
          <button type="button" onClick={onEnvoi} disabled={etat === 'envoi' || elements.length === 0}
            className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50">
            {etat === 'envoi' ? fr.copies.envoiEnCours : etat === 'partiel' ? fr.copies.reessayer : fr.copies.envoyer}
          </button>
        </>
      )}
    </section>
  );
}
