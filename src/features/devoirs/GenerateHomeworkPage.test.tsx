import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const mockGenerer = vi.fn();
vi.mock('./api', () => ({
  genererDevoir: (...a: unknown[]) => mockGenerer(...a),
  GenerationError: class extends Error { code: string; constructor(c: string) { super(c); this.code = c; } },
}));
vi.mock('../../lib/devoirsCache', () => ({ mettreEnCacheDevoir: vi.fn() }));

let etatNav: { eleve?: string; classe?: string; matieres?: string[] } = { eleve: 'Lamine K', classe: 'CP1' };
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useParams: () => ({ childId: 'c1' }),
  useLocation: () => ({ state: etatNav }),
}));

import { GenerateHomeworkPage } from './GenerateHomeworkPage';

function rendre() {
  return render(<MemoryRouter><GenerateHomeworkPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  etatNav = { eleve: 'Lamine K', classe: 'CP1' };
});

it('mode primaire : génère un devoir et l’affiche', async () => {
  mockGenerer.mockResolvedValue({
    homeworkId: 'h1',
    devoir: { matieres: [{ nom: 'Français', exercices: [{ numero: 1, consigne: 'Lis.', type: 'ecriture', items: [], espaceReponse: 'lignes' }] }] },
  });
  rendre();
  await userEvent.type(screen.getByLabelText('Générer un devoir'), 'Français : syllabes MA ME');
  await userEvent.click(screen.getByRole('button', { name: 'Générer le devoir' }));
  expect(await screen.findByText('Français')).toBeInTheDocument();
  expect(mockGenerer).toHaveBeenCalledWith('c1', { mode: 'primaire', message: 'Français : syllabes MA ME' });
});

it('mode primaire : affiche le quota atteint', async () => {
  const { GenerationError } = await import('./api');
  mockGenerer.mockRejectedValue(new GenerationError('quota'));
  rendre();
  await userEvent.type(screen.getByLabelText('Générer un devoir'), 'Français : syllabes');
  await userEvent.click(screen.getByRole('button', { name: 'Générer le devoir' }));
  expect(await screen.findByText(/Quota de la semaine atteint/)).toBeInTheDocument();
});

it('mode secondaire : un champ par matière, n’envoie que les matières remplies', async () => {
  etatNav = { eleve: 'Awa T', classe: '6EME', matieres: ['Français', 'Mathématiques'] };
  mockGenerer.mockResolvedValue({
    homeworkId: 'h2',
    devoir: { matieres: [{ nom: 'Mathématiques', exercices: [{ numero: 1, consigne: 'Calcule.', type: 'calcul', items: [], espaceReponse: 'cadre', points: 20 }] }] },
  });
  rendre();
  await userEvent.type(screen.getByLabelText('Mathématiques'), 'Les fractions.');
  await userEvent.click(screen.getByRole('button', { name: 'Générer le contrôle' }));
  expect(await screen.findByText('Contrôle')).toBeInTheDocument();
  expect(mockGenerer).toHaveBeenCalledWith('c1', {
    mode: 'secondaire',
    matieres: [{ matiere: 'Mathématiques', contenu: 'Les fractions.' }],
  });
});
