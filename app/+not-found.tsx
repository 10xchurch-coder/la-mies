// Dirección que no existe (por ejemplo, un link viejo en la web): volver al inicio.
import { Redirect } from 'expo-router';

export default function NotFound() {
  return <Redirect href="/" />;
}
