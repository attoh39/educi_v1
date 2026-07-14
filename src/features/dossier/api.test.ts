import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => mockFrom(...a) } }));

import { listerCompetences } from './api';

beforeEach(() => vi.clearAllMocks());

describe('listerCompetences', () => {
  it('liste les compétences d’un enfant triées par matière', async () => {
    const order2 = vi.fn().mockResolvedValue({ data: [], error: null });
    const order1 = vi.fn().mockReturnValue({ order: order2 });
    const eq = vi.fn().mockReturnValue({ order: order1 });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });
    const data = await listerCompetences('c1');
    expect(data).toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith('skill_records');
    expect(eq).toHaveBeenCalledWith('child_id', 'c1');
    expect(order1).toHaveBeenCalledWith('matiere');
    expect(order2).toHaveBeenCalledWith('competence');
  });
});
