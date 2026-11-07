// Prueba las migraciones y las reglas de seguridad en un Postgres local.
// Uso: PGHOST=/tmp PGPORT=5433 PGUSER=postgres node scripts/test-sql.mjs
// (necesita psql instalado; crea y borra una base "lamies_test").
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = 'lamies_test';
const env = { ...process.env, PGDATABASE: 'postgres' };
const psql = (args, options = {}) =>
  execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', ...args], { stdio: 'inherit', env, ...options });

psql(['-c', `drop database if exists ${db}`]);
psql(['-c', `create database ${db}`]);
const tenv = { ...env, PGDATABASE: db };
const files = [
  'scripts/local-auth-stub.sql',
  'supabase/migrations/0001_schema.sql',
  'supabase/migrations/0002_security.sql',
  'supabase/migrations/0003_functions.sql',
  'supabase/tests/rls_test.sql',
  'supabase/migrations/0004_church.sql',
  'supabase/tests/rls_test_2.sql',
  'supabase/migrations/0005_attendance_takers.sql',
  'supabase/tests/rls_test_3.sql',
  'supabase/migrations/0006_devocional_seguridad.sql',
  'supabase/tests/rls_test_4.sql',
  'supabase/migrations/0007_eliminar_cuenta.sql',
  'supabase/tests/rls_test_5.sql',
  'supabase/migrations/0008_errores_app.sql',
  'supabase/migrations/0009_devocional_estudio.sql',
  'supabase/migrations/0010_familia_bautismo_turnos.sql',
  'supabase/tests/rls_test_6.sql',
  'supabase/migrations/0011_ministerio_personas.sql',
  'supabase/tests/rls_test_7.sql',
  'supabase/migrations/0012_devocional_comentarios.sql',
  'supabase/tests/rls_test_8.sql',
  'supabase/migrations/0014_desvincular_cuenta.sql',
  'supabase/tests/rls_test_9.sql',
  'supabase/migrations/0015_salidas_olvidadas.sql',
  'supabase/tests/rls_test_10.sql',
  'supabase/migrations/0016_v07.sql',
  'supabase/tests/rls_test_11.sql',
  'supabase/migrations/0017_recalcular_cobertura.sql',
  'supabase/tests/rls_test_12.sql',
];
for (const f of files) {
  console.log(`▶ ${f}`);
  execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', '-f', path.join(root, f)], { stdio: 'inherit', env: tenv });
}
console.log('✔ SQL y seguridad: todo pasó');
