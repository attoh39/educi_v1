import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockFrom = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

import { genererDevoir, listerDevoirs } from './api';

beforeEach(() => vi.clearAllMocks());

describe('genererDevoir', () => {
  it('invoque la fonction en mode primaire', async () => {
    mockInvoke.mockResolvedValue({ data: { homeworkId: 'h1', devoir: { matieres: [] } }, error: null });
    const r = await genererDevoir('c1', { mode: 'primaire', message: 'Français : syllabes' });
    expect(r.homeworkId).toBe('h1');
    expect(mockInvoke).toHaveBeenCalledWith('generate-homework', {
      body: { childId: 'c1', message: 'Français : syllabes' },
    });
  });
  it('invoque la fonction en mode secondaire', async () => {
    mockInvoke.mockResolvedValue({ data: { homeworkId: 'h2', devoir: { matieres: [] } }, error: null });
    await genererDevoir('c1', { mode: 'secondaire', matieres: [{ matiere: 'Maths', contenu: 'fractions' }] });
    expect(mockInvoke).toHaveBeenCalledWith('generate-homework', {
      body: { childId: 'c1', matieres: [{ matiere: 'Maths', contenu: 'fractions' }] },
    });
  });
  it('propage le statut de quota', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { context: { status: 429 } },
    });
    await expect(genererDevoir('c1', { mode: 'primaire', message: 'msg valide' })).rejects.toMatchObject({ code: 'quota' });
  });
});

describe('listerDevoirs', () => {
  it('liste les devoirs d’un enfant, plus récents d’abord', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });
    const data = await listerDevoirs('c1');
    expect(data).toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith('homeworks');
    expect(eq).toHaveBeenCalledWith('child_id', 'c1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});
