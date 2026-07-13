import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/tests/**/*.test.ts'],
    testTimeout: 30_000,
    // Tests d'intégration sur un stack Supabase local partagé : exécuter les
    // fichiers un par un pour ne pas saturer le conteneur storage (timeouts DB).
    fileParallelism: false,
  },
});
