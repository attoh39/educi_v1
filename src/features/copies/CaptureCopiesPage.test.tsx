import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const mockCompresser = vi.fn();
const mockEnvoyer = vi.fn();
const mockCreer = vi.fn();
vi.mock('./compression', () => ({ compresserImage: (...a: unknown[]) => mockCompresser(...a) }));
vi.mock('./envoi', () => ({ envoyerElements: (...a: unknown[]) => mockEnvoyer(...a) }));
vi.mock('./api', () => ({ creerSoumission: (...a: unknown[]) => mockCreer(...a) }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'parent-1' } } }) }));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useParams: () => ({ childId: 'c1', homeworkId: 'h1' }),
}));

import { CaptureCopiesPage } from './CaptureCopiesPage';

function rendre() {
  return render(<MemoryRouter><CaptureCopiesPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

it('ajoute une photo puis envoie et confirme', async () => {
  mockCompresser.mockResolvedValue(new Blob(['z'], { type: 'image/jpeg' }));
  mockEnvoyer.mockResolvedValue({ envoyes: ['parent-1/c1/h1/u.jpg'], echoues: [] });
  mockCreer.mockResolvedValue({ id: 's1' });
  rendre();
  const fichier = new File(['x'], 'copie.jpg', { type: 'image/jpeg' });
  await userEvent.upload(screen.getByLabelText('Ajouter une photo'), fichier);
  await waitFor(() => expect(screen.getByText(/1 photo/)).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
  expect(await screen.findByText(/Copies envoyées/)).toBeInTheDocument();
  expect(mockCreer).toHaveBeenCalledWith('h1', 'c1', ['parent-1/c1/h1/u.jpg']);
});

it('affiche un envoi partiel en cas d’échec', async () => {
  mockCompresser.mockResolvedValue(new Blob(['z'], { type: 'image/jpeg' }));
  mockEnvoyer.mockResolvedValue({ envoyes: [], echoues: ['u'] });
  rendre();
  const fichier = new File(['x'], 'copie.jpg', { type: 'image/jpeg' });
  await userEvent.upload(screen.getByLabelText('Ajouter une photo'), fichier);
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
  expect(await screen.findByText(/Certaines photos/)).toBeInTheDocument();
  expect(mockCreer).not.toHaveBeenCalled();
});
