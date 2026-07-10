import { Link } from 'react-router-dom';
import { fr } from '../../i18n/fr';

export function HomePage() {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-slate-800">{fr.accueil.bienvenue}</h2>
      <p className="text-slate-600">{fr.accueil.intro}</p>
      <Link to="/enfants"
        className="inline-block rounded-lg bg-teal-600 px-4 py-3 font-semibold text-white">
        {fr.enfants.ajouter}
      </Link>
    </section>
  );
}
