import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

const mockCreerEnfant = vi.fn();
vi.mock('./api', () => ({
  creerEnfant: (...a: unknown[]) => mockCreerEnfant(...a),
}));

import { NewChildPage } from './NewChildPage';

function rendre() {
  return render(<MemoryRouter><NewChildPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

it('affiche les erreurs de validation sur soumission vide', async () => {
  rendre();
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(await screen.findAllByText('Ce champ est obligatoire.')).not.toHaveLength(0);
  expect(mockCreerEnfant).not.toHaveBeenCalled();
});

it('préremplit les matières selon la classe choisie', async () => {
  rendre();
  await userEvent.selectOptions(screen.getByLabelText('Classe'), 'CP1');
  expect(screen.getByRole('checkbox', { name: 'Français' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Mathématiques' })).toBeChecked();
});

it('soumet un enfant valide', async () => {
  mockCreerEnfant.mockResolvedValue('child-id');
  rendre();
  await userEvent.type(screen.getByLabelText('Nom'), 'Kouassi');
  await userEvent.type(screen.getByLabelText('Prénoms'), 'Lamine');
  await userEvent.type(screen.getByLabelText('Date de naissance'), '2019-03-12');
  await userEvent.selectOptions(screen.getByLabelText('Sexe'), 'M');
  await userEvent.selectOptions(screen.getByLabelText('Classe'), 'CP1');
  await userEvent.type(screen.getByLabelText('Établissement scolaire'), 'EPP Cocody');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(mockCreerEnfant).toHaveBeenCalledTimes(1);
  const [valeurs, annee] = mockCreerEnfant.mock.calls[0];
  expect(valeurs.nom).toBe('Kouassi');
  expect(valeurs.matieres).toContain('Français');
  expect(annee).toMatch(/^\d{4}-\d{4}$/);
});
