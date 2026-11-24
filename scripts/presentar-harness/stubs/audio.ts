// Reproductor de mentira: anota lo que le piden.
type Log = { uri: string; event: string }[];
const log = (): Log => ((window as unknown as { __audio?: Log }).__audio = (window as unknown as { __audio?: Log }).__audio ?? []);
export type AudioPlayer = { play: () => void; pause: () => void; remove: () => void };
export const createAudioPlayer = (src: { uri: string }): AudioPlayer => {
  log().push({ uri: src.uri, event: 'crear' });
  return { play: () => log().push({ uri: src.uri, event: 'play' }), pause: () => log().push({ uri: src.uri, event: 'pausa' }), remove: () => log().push({ uri: src.uri, event: 'cerrar' }) };
};
export const setAudioModeAsync = async () => undefined;
