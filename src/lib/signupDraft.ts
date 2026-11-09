// Lo que la persona ya escribió en la pantalla de inicio (correo y contraseña) pasa a "Crear cuenta"
// en memoria, sin ponerlo en la dirección de la pantalla.
let draft: { email: string; password: string } | null = null;
export const setSignupDraft = (email: string, password: string) => { draft = { email, password }; };
export const takeSignupDraft = () => { const d = draft; draft = null; return d; };
