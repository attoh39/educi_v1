import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => mockGetSession(...a),
      onAuthStateChange: (...a: unknown[]) => mockOnAuthStateChange(...a),
    },
  },
}));

import { AuthProvider, useAuth } from './AuthProvider';

function Sonde() {
  const { session, loading } = useAuth();
  if (loading) return <p>chargement</p>;
  return <p>{session ? 'connecté' : 'déconnecté'}</p>;
}

beforeEach(() => {
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

it('expose la session une fois chargée', async () => {
  const session = { user: { id: 'u1' } } as unknown as Session;
  mockGetSession.mockResolvedValue({ data: { session } });
  render(<AuthProvider><Sonde /></AuthProvider>);
  expect(screen.getByText('chargement')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('connecté')).toBeInTheDocument());
});

it('expose null sans session', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  render(<AuthProvider><Sonde /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('déconnecté')).toBeInTheDocument());
});
