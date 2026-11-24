const w = window as unknown as { __slowUpload?: number };
export const presentUrl = async (path: string | null | undefined) => (path ? `https://archivos.prueba/${path}` : null);
export const removePresentFiles = async () => undefined;
// "Subir" tarda lo que diga la prueba, para probar qué pasa si se cambia la lista mientras tanto.
export const pickPresentMedia = async (_c: string, kind: string) => {
  await new Promise((r) => setTimeout(r, w.__slowUpload ?? 10));
  return { path: `c1/subido.${kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'mp3'}`, name: `subido.${kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'mp3'}` };
};
