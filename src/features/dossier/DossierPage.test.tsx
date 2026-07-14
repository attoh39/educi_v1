import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const mockLister = vi.fn();
vi.mock('./api', () => ({ listerCompetences: (...a: unknown[]) => mockLister(...a) }));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useParams: () => ({ childId: 'c1' }),
}));

import { DossierPage } from './DossierPage';

function rendre() { return render(<MemoryRouter><DossierPage /></MemoryRouter>); }
beforeEach(() => vi.clearAllMocks());

it('groupe les compétences par matière avec leur maîtrise', async () => {
  mockLister.mockResolvedValue([
    { id: '1', matiere: 'Français', competence: 'syllabes', maitrise: 'acquis', observations: 2, updated_at: '2026-07-13T10:00:00Z' },
    { id: '2', matiere: 'Mathématiques', competence: 'additions', maitrise: 'fragile', observations: 1, updated_at: '2026-07-13T10:00:00Z' },
  ]);
  rendre();
  expect(await screen.findByText('Français')).toBeInTheDocument();
  expect(screen.getByText('syllabes')).toBeInTheDocument();
  expect(screen.getByText('Acquis')).toBeInTheDocument();
  expect(screen.getByText('Fragile')).toBeInTheDocument();
});

it('affiche l’état vide', async () => {
  mockLister.mockResolvedValue([]);
  rendre();
  expect(await screen.findByText(/Aucune donnée/)).toBeInTheDocument();
});
