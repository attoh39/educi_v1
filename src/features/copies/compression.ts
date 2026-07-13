export function dimensionsCibles(
  largeur: number,
  hauteur: number,
  maxLargeur = 1600,
): { largeur: number; hauteur: number } {
  if (largeur <= maxLargeur) return { largeur, hauteur };
  const ratio = maxLargeur / largeur;
  return { largeur: maxLargeur, hauteur: Math.round(hauteur * ratio) };
}

// Compression réelle (navigateur). Non testée sous jsdom (canvas absent) ;
// vérifiée en E2E. La logique risquée (dimensions) est isolée et testée.
export async function compresserImage(fichier: Blob, maxLargeur = 1600, qualite = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(fichier);
  const { largeur, hauteur } = dimensionsCibles(bitmap.width, bitmap.height, maxLargeur);
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponible');
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('compression'))), 'image/jpeg', qualite),
  );
}
