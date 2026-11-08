// Reglas de contraseña de La Mies: al menos 10 caracteres, con letras y números,
// y que no sea de las muy comunes. Se revisa en la app antes de mandarla.
const COMMON = ['contrasena', 'contraseña', 'password', '1234567890', 'qwertyuiop', 'iglesia123', 'lamies2026', 'abcdefghij'];

export type PasswordCheck = { ok: boolean; problems: string[]; strength: 'débil' | 'buena' | 'fuerte' };

export function checkPassword(pw: string, personal: string[] = []): PasswordCheck {
  const problems: string[] = [];
  if (pw.length < 10) problems.push('Tiene que tener al menos 10 caracteres.');
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(pw)) problems.push('Tiene que tener alguna letra.');
  if (!/\d/.test(pw)) problems.push('Tiene que tener algún número.');
  const low = pw.toLowerCase();
  if (COMMON.some((c) => low.includes(c))) problems.push('Es una contraseña muy común.');
  for (const p of personal) {
    const v = p.trim().toLowerCase();
    if (v.length >= 4 && low.includes(v)) {
      problems.push('No uses tu nombre ni tu correo en la contraseña.');
      break;
    }
  }
  if (/^(.)\1+$/.test(pw)) problems.push('No repitas siempre el mismo carácter.');
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const strength: PasswordCheck['strength'] = problems.length ? 'débil' : score >= 3 ? 'fuerte' : 'buena';
  return { ok: problems.length === 0, problems, strength };
}

/**
 * ¿Esta contraseña apareció en filtraciones conocidas? Usa la lista pública de Have I Been Pwned
 * sin mandar la contraseña: solo los primeros 5 caracteres de su huella SHA-1 (k-anonimato).
 * Si no hay internet o el servicio no responde, no frena a nadie (devuelve 0).
 */
export async function leakedCount(pw: string): Promise<number> {
  try {
    const Crypto = await import('expo-crypto');
    const hash = (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, pw)).toUpperCase();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return 0;
    const line = (await res.text()).split('\n').find((l) => l.startsWith(hash.slice(5)));
    return line ? Number(line.split(':')[1]) || 0 : 0;
  } catch {
    return 0;
  }
}

export const LEAKED_MSG = 'Esa contraseña apareció en filtraciones de internet. Elegí otra que no uses en ningún otro lado.';
