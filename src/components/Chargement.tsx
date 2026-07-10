import { fr } from '../i18n/fr';

export function Chargement() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-slate-500">
      <p role="status">{fr.commun.chargement}</p>
    </div>
  );
}
