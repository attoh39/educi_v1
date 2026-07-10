import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

import { creerEnfant, listerEnfants } from './api';

beforeEach(() => vi.clearAllMocks());

describe('creerEnfant', () => {
  it('appelle la RPC atomique avec les bons paramètres', async () => {
    mockRpc.mockResolvedValue({ data: 'child-id', error: null });
    const id = await creerEnfant(
      {
        nom: 'Kouassi', prenoms: 'Lamine', dateNaissance: '2019-03-12',
        sexe: 'M', classe: 'CP1', etablissement: 'EPP Cocody',
        systeme: 'IVOIRIEN', matieres: ['Français'],
      },
      '2026-2027',
    );
    expect(id).toBe('child-id');
    expect(mockRpc).toHaveBeenCalledWith('create_child_with_enrollment', {
      p_nom: 'Kouassi', p_prenoms: 'Lamine', p_date_naissance: '2019-03-12',
      p_sexe: 'M', p_annee_scolaire: '2026-2027', p_classe: 'CP1',
      p_etablissement: 'EPP Cocody', p_systeme: 'IVOIRIEN',
      p_matieres: ['Français'],
    });
  });
  it("propage l'erreur Supabase", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(creerEnfant(
      {
        nom: 'K', prenoms: 'L', dateNaissance: '2019-03-12', sexe: 'M',
        classe: 'CP1', etablissement: 'E', systeme: 'IVOIRIEN', matieres: ['Français'],
      },
      '2026-2027',
    )).rejects.toThrow('boom');
  });
});

describe('listerEnfants', () => {
  it('liste les enfants avec leur inscription active', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });
    const data = await listerEnfants();
    expect(data).toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith('children');
    expect(select).toHaveBeenCalledWith('*, enrollments(*)');
    expect(eq).toHaveBeenCalledWith('enrollments.is_active', true);
  });
});
