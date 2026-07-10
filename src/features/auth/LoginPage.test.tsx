import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

const mockSignInWithOtp = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: (...a: unknown[]) => mockSignInWithOtp(...a),
      verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
    },
  },
}));

import { LoginPage } from './LoginPage';

function rendre() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

it('envoie un OTP par téléphone (mode par défaut)', async () => {
  mockSignInWithOtp.mockResolvedValue({ error: null });
  rendre();
  await userEvent.type(
    screen.getByLabelText('Numéro de téléphone'), '+2250700000001');
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
  expect(mockSignInWithOtp).toHaveBeenCalledWith({ phone: '+2250700000001' });
  expect(await screen.findByLabelText('Code reçu')).toBeInTheDocument();
});

it("bascule en mode e-mail et envoie l'OTP par e-mail", async () => {
  mockSignInWithOtp.mockResolvedValue({ error: null });
  rendre();
  await userEvent.click(screen.getByRole('button', { name: 'E-mail' }));
  await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'a@b.ci');
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
  expect(mockSignInWithOtp).toHaveBeenCalledWith({ email: 'a@b.ci' });
});

it("affiche l'erreur si l'envoi échoue", async () => {
  mockSignInWithOtp.mockResolvedValue({ error: { message: 'boom' } });
  rendre();
  await userEvent.type(
    screen.getByLabelText('Numéro de téléphone'), '+2250700000001');
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
  expect(await screen.findByText(
    "Impossible d'envoyer le code. Vérifiez votre saisie puis réessayez.",
  )).toBeInTheDocument();
});

it('vérifie le code saisi', async () => {
  mockSignInWithOtp.mockResolvedValue({ error: null });
  mockVerifyOtp.mockResolvedValue({ error: null });
  rendre();
  await userEvent.type(
    screen.getByLabelText('Numéro de téléphone'), '+2250700000001');
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
  await userEvent.type(await screen.findByLabelText('Code reçu'), '123456');
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
  expect(mockVerifyOtp).toHaveBeenCalledWith({
    phone: '+2250700000001', token: '123456', type: 'sms',
  });
});

it('affiche une erreur si le code est invalide', async () => {
  mockSignInWithOtp.mockResolvedValue({ error: null });
  mockVerifyOtp.mockResolvedValue({ error: { message: 'invalid' } });
  rendre();
  await userEvent.type(
    screen.getByLabelText('Numéro de téléphone'), '+2250700000001');
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
  await userEvent.type(await screen.findByLabelText('Code reçu'), '000000');
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
  expect(await screen.findByText('Code invalide ou expiré. Réessayez.'))
    .toBeInTheDocument();
});
