import { describe, expect, it } from 'vitest';
import { dimensionsCibles } from './compression';

describe('dimensionsCibles', () => {
  it('ne redimensionne pas sous la largeur max', () => {
    expect(dimensionsCibles(800, 600, 1600)).toEqual({ largeur: 800, hauteur: 600 });
  });
  it('réduit en conservant le ratio', () => {
    expect(dimensionsCibles(3200, 2400, 1600)).toEqual({ largeur: 1600, hauteur: 1200 });
  });
});
