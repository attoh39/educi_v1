import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { fr } from '../../i18n/fr';
import type { Classe } from '../../domain/classes';
import { mettreEnCacheDevoir } from '../../lib/devoirsCache';
import { DevoirDocument } from './DevoirDocument';
import { genererDevoir, GenerationError } from './api';
import type { Devoir } from './schema';

export function GenerateHomeworkPage() {
  const { childId } = useParams();
  const location = useLocation() as { state?: { eleve?: string; classe?: string } };
  const eleve = location.state?.eleve ?? '';
  const classe = (location.state?.classe ?? '') as Classe | string;

  const [message, setMessage] = useState('');
  const [devoir, setDevoir] = useState<Devoir | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const enVol = useRef(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (enVol.current || !childId) return;
    enVol.current = true;
    setEnCours(true);
    setErreur(null);
    try {
      const r = await genererDevoir(childId, message.trim());
      await mettreEnCacheDevoir(r.homeworkId, r.devoir);
      setDevoir(r.devoir);
    } catch (e) {
      setErreur(e instanceof GenerationError && e.code === 'quota' ? fr.devoirs.quotaAtteint : fr.devoirs.echec);
    } finally {
      enVol.current = false;
      setEnCours(false);
    }
  }

  const dateDuJour = new Date().toLocaleDateString('fr-FR');

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">{fr.devoirs.titre}</h2>

      {!devoir && (
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            {fr.devoirs.titre}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={fr.devoirs.exempleMessage}
              rows={6}
              required
              minLength={3}
              className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-base"
            />
          </label>
          <p className="text-sm text-slate-500">{fr.devoirs.instructionPrimaire}</p>
          <button type="submit" disabled={enCours}
            className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50">
            {enCours ? fr.devoirs.generationEnCours : fr.devoirs.generer}
          </button>
        </form>
      )}

      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</p>}

      {devoir && (
        <div className="space-y-3">
          <button type="button" onClick={() => window.print()}
            className="rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white print:hidden">
            {fr.devoirs.imprimer}
          </button>
          <DevoirDocument devoir={devoir} eleve={eleve} classe={classe} date={dateDuJour} />
        </div>
      )}
    </section>
  );
}
