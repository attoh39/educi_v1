import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const mockLister = vi.fn();
vi.mock('./api', () => ({ listerDevoirs: (...a: unknown[]) => mockLister(...a) }));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useParams: () => ({ childId: 'c1' }),
}));

import { DevoirsPage } from './DevoirsPage';

function rendre() {
  return render(<MemoryRouter><DevoirsPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

it('liste les devoirs avec un accès à l’envoi des copies', async () => {
  mockLister.mockResolvedValue([
    { id: 'h1', exercices: { matieres: [] }, created_at: '2026-07-13T10:00:00Z' },
  ]);
  rendre();
  expect(await screen.findByRole('link', { name: 'Envoyer les copies' })).toHaveAttribute(
    'href', '/enfants/c1/devoirs/h1/copies',
  );
});

it('affiche l’état vide', async () => {
  mockLister.mockResolvedValue([]);
  rendre();
  expect(await screen.findByText('Aucun devoir généré pour l’instant.')).toBeInTheDocument();
});
