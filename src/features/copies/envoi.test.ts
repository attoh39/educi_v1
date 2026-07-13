import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTeleverser = vi.fn();
vi.mock('./api', () => ({ televerserCopie: (...a: unknown[]) => mockTeleverser(...a) }));
vi.mock('./chemin', () => ({ cheminCopie: (p: string, c: string, h: string, id: string) => `${p}/${c}/${h}/${id}.jpg` }));

import { envoyerElements } from './envoi';

beforeEach(() => vi.clearAllMocks());

const el = (id: string) => ({ id, blob: new Blob(['x'], { type: 'image/jpeg' }) });

describe('envoyerElements', () => {
  it('téléverse chaque élément et retourne les chemins envoyés', async () => {
    mockTeleverser.mockResolvedValue(undefined);
    const r = await envoyerElements('p', 'c', 'h', [el('a'), el('b')]);
    expect(r.envoyes).toEqual(['p/c/h/a.jpg', 'p/c/h/b.jpg']);
    expect(r.echoues).toEqual([]);
  });
  it('collecte les échecs sans interrompre les suivants', async () => {
    mockTeleverser
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const r = await envoyerElements('p', 'c', 'h', [el('a'), el('b')]);
    expect(r.envoyes).toEqual(['p/c/h/b.jpg']);
    expect(r.echoues).toEqual(['a']);
  });
});
