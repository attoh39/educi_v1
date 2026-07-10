import { describe, expect, it } from 'vitest';
import migrationSql from '../../supabase/migrations/20260710120000_socle.sql?raw';
import { CLASSES } from './classes';

describe('synchronisation SQL <-> domaine', () => {
  it("l'enum classe_niveau de la migration contient exactement CLASSES", () => {
    const match = migrationSql.match(
      /create type public\.classe_niveau as enum \(([\s\S]*?)\);/,
    );
    expect(match).not.toBeNull();
    const valeursSql = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(valeursSql).toEqual([...CLASSES]);
  });
});
