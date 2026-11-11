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
  'supabase/migrations/0018_informe_clases_progreso.sql',
  'supabase/tests/rls_test_13.sql',
  'supabase/migrations/0019_eventos_anuales.sql',
  'supabase/migrations/0020_finanzas.sql',
  'supabase/tests/rls_test_14.sql',
  'supabase/migrations/0021_informes_domingo.sql',
  'supabase/tests/rls_test_15.sql',
  'supabase/migrations/0022_finanzas_cuentas.sql',
  'supabase/tests/rls_test_16.sql',
  'supabase/migrations/0023_denunciar_bloquear.sql',
  'supabase/tests/rls_test_17.sql',
  'supabase/migrations/0024_cobertura_precisa.sql',
  'supabase/tests/rls_test_18.sql',
  'supabase/migrations/0025_vereda_ambigua.sql',
  'supabase/tests/rls_test_19.sql',
  'supabase/migrations/0026_completar_recorrido.sql',
  'supabase/tests/rls_test_20.sql',
  'supabase/migrations/0027_veredas_con_casas.sql',
  'supabase/migrations/0028_pases_automaticos.sql',
  'supabase/tests/rls_test_21.sql',
  'supabase/migrations/0029_privacidad_ministerios.sql',
  'supabase/tests/rls_test_22.sql',
  'supabase/migrations/0030_seguridad.sql',
  'supabase/migrations/0031_perfil_privado.sql',
  'supabase/tests/rls_test_23.sql',
  'supabase/migrations/0032_permisos.sql',
  'supabase/tests/rls_test_24.sql',
  'supabase/migrations/0033_hijos_con_ficha.sql',
  'supabase/tests/rls_test_25.sql',
  'supabase/migrations/0034_eventos_detalle.sql',
  'supabase/tests/rls_test_26.sql',
  'supabase/migrations/0035_mapa_equipo.sql',
  'supabase/tests/rls_test_27.sql',
  'supabase/migrations/0036_vivo_seguimiento_ninos_rutas.sql',
  'supabase/tests/rls_test_28.sql',
  'supabase/migrations/0037_capacitacion_carpetas.sql',
  'supabase/tests/rls_test_29.sql',
  'supabase/migrations/0038_copias_semanales.sql',
  'supabase/tests/rls_test_30.sql',
  'supabase/migrations/0039_varios_roles.sql',
  'supabase/tests/rls_test_31.sql',
  'supabase/migrations/0040_arreglo_acceso.sql',
  'supabase/tests/rls_test_32.sql',
  'supabase/migrations/0041_unir_personas.sql',
  'supabase/tests/rls_test_33.sql',
  'supabase/migrations/0042_asistencia_maestros_turno.sql',
  'supabase/tests/rls_test_34.sql',
  'supabase/migrations/0043_borrar_cuenta_ya.sql',
  'supabase/tests/rls_test_35.sql',
  'supabase/migrations/0044_chat_colectivo_cumples.sql',
  'supabase/tests/rls_test_36.sql',
  'supabase/migrations/0045_chat_fotos_archivos_encuestas.sql',
  'supabase/tests/rls_test_37.sql',
  'supabase/migrations/0046_colectivo_recorrido.sql',
  'supabase/tests/rls_test_38.sql',
  'supabase/migrations/0047_camino_preguntas.sql',
  'supabase/tests/rls_test_39.sql',
  'supabase/migrations/0048_certificado_bautismo.sql',
  'supabase/tests/rls_test_40.sql',
  'supabase/migrations/0049_notas_estudio.sql',
  'supabase/migrations/0050_celular_obligatorio.sql',
  'supabase/migrations/0051_importar_personas.sql',
  'supabase/migrations/0052_salidas_que_cuentan.sql',
  'supabase/migrations/0053_chat_como_whatsapp.sql',
  'supabase/migrations/0054_alabanza.sql',
  'supabase/migrations/0055_recorrido_colectivo.sql',
  'supabase/migrations/0056_informe_miembros.sql',
  'supabase/tests/rls_test_41.sql',
  'supabase/tests/rls_test_42.sql',
  'supabase/tests/rls_test_43.sql',
  'supabase/tests/rls_test_44.sql',
  'supabase/tests/rls_test_45.sql',
  'supabase/tests/rls_test_46.sql',
  'supabase/tests/rls_test_47.sql',
  'supabase/tests/rls_test_48.sql',
];
// MIGRATIONS_FIRST=1: todas las migraciones primero y después todas las pruebas (para ver que lo nuevo no rompe lo viejo).
const order = process.env.MIGRATIONS_FIRST ? [...files.filter((f) => !f.includes('/tests/')), ...files.filter((f) => f.includes('/tests/'))] : files;
for (const f of order) {
  console.log(`▶ ${f}`);
  execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', '-f', path.join(root, f)], { stdio: 'inherit', env: tenv });
}
console.log('✔ SQL y seguridad: todo pasó');
