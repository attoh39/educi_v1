import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { fr } from '../../i18n/fr';

export function AccountPage() {
  const { session } = useAuth();
  const identifiant = session?.user.phone || session?.user.email || '';
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">{fr.compte.titre}</h2>
      <p className="text-slate-600">
        {fr.compte.identifiant} : <span className="font-medium">{identifiant}</span>
      </p>
      <button type="button" onClick={() => supabase.auth.signOut()}
        className="rounded-lg border border-red-300 px-4 py-2 font-medium text-red-600">
        {fr.auth.deconnexion}
      </button>
    </section>
  );
}
