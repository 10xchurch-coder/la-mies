const log = () => ((window as unknown as { __awake?: string[] }).__awake = (window as unknown as { __awake?: string[] }).__awake ?? []);
export const activateKeepAwakeAsync = async (tag?: string) => { log().push(`on:${tag}`); };
export const deactivateKeepAwake = async (tag?: string) => { log().push(`off:${tag}`); };
