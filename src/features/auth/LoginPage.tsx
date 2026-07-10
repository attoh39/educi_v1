import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { fr } from '../../i18n/fr';

type Methode = 'telephone' | 'email';
type Etape = 'saisie' | 'code';

export function LoginPage() {
  const navigate = useNavigate();
  const [methode, setMethode] = useState<Methode>('telephone');
  const [identifiant, setIdentifiant] = useState('');
  const [etape, setEtape] = useState<Etape>('saisie');
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const enVol = useRef(false);

  async function envoyerCode(e: FormEvent) {
    e.preventDefault();
    if (enVol.current) return;
    enVol.current = true;
    setEnCours(true);
    setErreur(null);
    try {
      const identifiantNettoye =
        methode === 'email' ? identifiant.trim() : identifiant.replace(/\s/g, '');
      const { error } = methode === 'email'
        ? await supabase.auth.signInWithOtp({ email: identifiantNettoye })
        : await supabase.auth.signInWithOtp({ phone: identifiantNettoye });
      if (error) { setErreur(fr.auth.erreurEnvoi); return; }
      setEtape('code');
    } finally {
      enVol.current = false;
      setEnCours(false);
    }
  }

  async function verifierCode(e: FormEvent) {
    e.preventDefault();
    if (enVol.current) return;
    enVol.current = true;
    setEnCours(true);
    setErreur(null);
    try {
      const jeton = code.trim();
      const { error } = methode === 'email'
        ? await supabase.auth.verifyOtp({ email: identifiant, token: jeton, type: 'email' })
        : await supabase.auth.verifyOtp({ phone: identifiant, token: jeton, type: 'sms' });
      if (error) { setErreur(fr.auth.codeInvalide); return; }
      navigate('/', { replace: true });
    } finally {
      enVol.current = false;
      setEnCours(false);
    }
  }

  const bascule = (m: Methode) => () => {
    setMethode(m);
    setIdentifiant('');
    setEtape('saisie');
    setErreur(null);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <h1 className="text-2xl font-bold text-teal-700">{fr.auth.titre}</h1>
      <p className="mt-1 text-sm text-slate-500">{fr.auth.sousTitre}</p>

      <div className="mt-6 flex rounded-lg bg-slate-100 p-1" role="group">
        <button type="button" onClick={bascule('telephone')}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            methode === 'telephone' ? 'bg-white shadow' : 'text-slate-500'}`}>
          {fr.auth.onglets.telephone}
        </button>
        <button type="button" onClick={bascule('email')}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            methode === 'email' ? 'bg-white shadow' : 'text-slate-500'}`}>
          {fr.auth.onglets.email}
        </button>
      </div>

      {etape === 'saisie' ? (
        <form onSubmit={envoyerCode} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            {methode === 'telephone' ? fr.auth.champTelephone : fr.auth.champEmail}
            <input
              type={methode === 'telephone' ? 'tel' : 'email'}
              inputMode={methode === 'telephone' ? 'tel' : 'email'}
              placeholder={methode === 'telephone' ? fr.auth.exempleTelephone : ''}
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
            />
          </label>
          <button type="submit" disabled={enCours}
            className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50">
            {enCours ? fr.auth.envoiEnCours : fr.auth.envoyerCode}
          </button>
        </form>
      ) : (
        <form onSubmit={verifierCode} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            {fr.auth.champCode}
            <input
              inputMode="numeric" autoComplete="one-time-code"
              value={code} onChange={(e) => setCode(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-xl tracking-widest"
            />
          </label>
          <button type="submit" disabled={enCours}
            className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50">
            {enCours ? fr.auth.verificationEnCours : fr.auth.verifierCode}
          </button>
          <button type="button" onClick={bascule(methode)}
            className="w-full py-2 text-sm text-teal-700">
            {fr.auth.changerIdentifiant}
          </button>
        </form>
      )}

      {erreur && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {erreur}
        </p>
      )}
    </div>
  );
}
