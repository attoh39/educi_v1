import { describe, expect, it } from 'vitest';
import { cheminCopie } from './chemin';

describe('cheminCopie', () => {
  it('construit parentId/childId/homeworkId/id.jpg', () => {
    expect(cheminCopie('p', 'c', 'h', 'u')).toBe('p/c/h/u.jpg');
  });
});
