/** Quota de génération par enfant et par semaine pendant la période de lancement. */
export const GENERATIONS_PAR_SEMAINE = 10;

/** Numéro de semaine ISO 8601 (lundi = premier jour) au format `AAAA-Www`. */
export function semaineIso(date: Date): string {
  // Copie en UTC pour un calcul indépendant du fuseau.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const jour = d.getUTCDay() || 7; // dimanche (0) -> 7
  d.setUTCDate(d.getUTCDate() + 4 - jour); // jeudi de la semaine courante
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semaine = Math.ceil(((d.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semaine).padStart(2, '0')}`;
}
