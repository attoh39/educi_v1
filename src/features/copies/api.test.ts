import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpload = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
const mockInvoke = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: {
    storage: { from: () => ({ upload: (...a: unknown[]) => mockUpload(...a) }) },
    from: (...a: unknown[]) => mockFrom(...a),
    auth: { getUser: () => mockGetUser() },
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  },
}));

import { corrigerSoumission, creerSoumission, listerSoumissions, televerserCopie } from './api';

beforeEach(() => vi.clearAllMocks());

describe('corrigerSoumission', () => {
  it('invoque correct-submission et propage le quota', async () => {
    mockInvoke.mockResolvedValue({ data: { note: 15, appreciation: 'ok', details: [] }, error: null });
    const c = await corrigerSoumission('s1');
    expect(c.appreciation).toBe('ok');
    expect(mockInvoke).toHaveBeenCalledWith('correct-submission', { body: { submissionId: 's1' } });
    mockInvoke.mockResolvedValue({ data: null, error: { context: { status: 429 } } });
    await expect(corrigerSoumission('s1')).rejects.toMatchObject({ code: 'quota' });
  });
});

describe('televerserCopie', () => {
  it('téléverse le blob et propage une erreur', async () => {
    mockUpload.mockResolvedValue({ error: null });
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await televerserCopie('p/c/h/u.jpg', blob);
    expect(mockUpload).toHaveBeenCalledWith('p/c/h/u.jpg', blob, { contentType: 'image/jpeg', upsert: false });
    mockUpload.mockResolvedValue({ error: new Error('boom') });
    await expect(televerserCopie('p/c/h/u.jpg', blob)).rejects.toThrow('boom');
  });
});

describe('creerSoumission', () => {
  it('insère la soumission avec le parent de la session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'parent-1' } } });
    const single = vi.fn().mockResolvedValue({ data: { id: 's1' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    mockFrom.mockReturnValue({ insert });
    const s = await creerSoumission('h1', 'c1', ['p/c/h/u.jpg']);
    expect(s.id).toBe('s1');
    expect(mockFrom).toHaveBeenCalledWith('submissions');
    expect(insert).toHaveBeenCalledWith({
      parent_id: 'parent-1', child_id: 'c1', homework_id: 'h1',
      photo_paths: ['p/c/h/u.jpg'], statut: 'envoye',
    });
  });
});

describe('listerSoumissions', () => {
  it('liste par devoir, plus récentes d’abord', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });
    const data = await listerSoumissions('h1');
    expect(data).toEqual([]);
    expect(eq).toHaveBeenCalledWith('homework_id', 'h1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});
