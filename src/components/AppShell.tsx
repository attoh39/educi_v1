import { NavLink, Outlet } from 'react-router-dom';
import { fr } from '../i18n/fr';

const lienClasse = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
    isActive ? 'text-teal-700' : 'text-slate-400'}`;

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="sticky top-0 z-10 bg-teal-600 px-4 py-3 text-white shadow">
        <h1 className="mx-auto w-full max-w-2xl text-lg font-bold">{fr.app.nom}</h1>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>
      <nav aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-2xl">
          <NavLink to="/" end className={lienClasse}>{fr.nav.accueil}</NavLink>
          <NavLink to="/enfants" className={lienClasse}>{fr.nav.enfants}</NavLink>
          <NavLink to="/compte" className={lienClasse}>{fr.nav.compte}</NavLink>
        </div>
      </nav>
    </div>
  );
}
