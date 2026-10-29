/**
 * Pruebas de mutación: «tests que deben fallar».
 * Introduce a propósito un fallo en una regla importante, ejecuta los tests que la cubren y comprueba
 * que FALLAN. Si un test sigue en verde con el código roto, ese test no protege la regla.
 * El código se restaura siempre, también si el proceso se interrumpe.
 *
 *   npm run mutaciones -w api            (escribe docs/mutaciones.md)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Mutacion {
  regla: string;
  archivo: string;
  buscar: string;
  poner: string;
  tests: string[];
}

const M: Mutacion[] = [
  { regla: 'Autenticación: el JWT se verifica con la clave y el algoritmo', archivo: 'src/middleware/auth.ts', buscar: "jwt.verify(token, secreto(), { algorithms: ['HS256'] }) as Sesion", poner: 'jwt.decode(token) as Sesion', tests: ['src/test/plataforma.test.ts'] },
  { regla: 'Autorización por rol en el servidor', archivo: 'src/lib/ruta.ts', buscar: "if (Array.isArray(acceso) && usuario!.rol !== 'DUENO' && !acceso.includes(usuario!.rol)) throw prohibido();", poner: '', tests: ['src/test/cuenta.test.ts'] },
  { regla: 'Un cliente no accede a vehículos de otro (404)', archivo: 'src/servicios/acceso.ts', buscar: '(v.cliente.usuarioId !== u.id || v.eliminadoEn)', poner: 'v.eliminadoEn', tests: ['src/test/cuenta.test.ts'] },
  { regla: 'CSRF: las peticiones con cuerpo deben ser JSON (415)', archivo: 'src/middleware/errores.ts', buscar: "&& !req.is('application/json')", poner: '&& false', tests: ['src/test/plataforma.test.ts'] },
  { regla: 'Límite de tamaño del cuerpo (413)', archivo: 'src/app.ts', buscar: "limit: '100kb'", poner: "limit: '10mb'", tests: ['src/test/plataforma.test.ts'] },
  { regla: 'Query estricta: parámetros desconocidos dan 400', archivo: 'src/lib/ruta.ts', buscar: 'def.query instanceof z.ZodObject ? def.query.strict() : def.query', poner: 'def.query', tests: ['src/test/plataforma.test.ts'] },
  { regla: 'Capacidad: dos clientes no se quedan la misma última plaza (cerrojo)', archivo: 'src/modulos/citas.ts', buscar: '  await bloquear(tx, `citas:${dia}`);\n  const o = await ocupacionDia(tx, dia, c);', poner: '  const o = await ocupacionDia(tx, dia, c);', tests: ['src/test/agenda.test.ts'] },
  { regla: 'Cancelar con 24 h exactas sí se permite (límite incluido)', archivo: 'src/domain/capacidad.ts', buscar: '>= horasMinimas * 3_600_000', poner: '> horasMinimas * 3_600_000', tests: ['src/test/agenda.test.ts', 'src/domain/dominio.test.ts'] },
  { regla: 'Doble clic: la Idempotency-Key no repite la operación', archivo: 'src/middleware/idempotencia.ts', buscar: "  const clave = req.get('Idempotency-Key');\n  if (!clave) return fn();", poner: '  return fn();', tests: ['src/test/agenda.test.ts'] },
  { regla: 'El cliente debe decidir todos los trabajos de una vez', archivo: 'src/domain/respuesta.ts', buscar: 'if (faltan.length) throw', poner: 'if (false) throw', tests: ['src/test/ordenes.test.ts', 'src/domain/respuesta.test.ts'] },
  { regla: 'No se completa con trabajos sin terminar', archivo: 'src/domain/respuesta.ts', buscar: 'const abiertas = aceptadas.filter((p) => !p.terminadaEn).length;', poner: 'const abiertas = 0;', tests: ['src/test/ordenes.test.ts'] },
  { regla: 'El stock nunca queda negativo', archivo: 'src/servicios/stock.ts', buscar: 'if (despues < 0) throw', poner: 'if (false) throw', tests: ['src/test/ordenes.test.ts', 'src/test/stock.test.ts'] },
  { regla: 'Todo cambio de stock queda registrado', archivo: 'src/servicios/stock.ts', buscar: '  await tx.movimientoStock.create({', poner: '  if (false) await tx.movimientoStock.create({', tests: ['src/test/stock.test.ts'] },
  { regla: 'Solo el jefe (o el dueño) cuadra el stock', archivo: 'src/modulos/piezas.ts', buscar: "  resumen: 'Cuadrar el stock con el recuento real',\n  descripcion: 'Tras un inventario: fija el stock al número contado. Solo el jefe (y el dueño), con motivo; la diferencia queda registrada.',\n  acceso: GESTION,", poner: "  resumen: 'Cuadrar el stock con el recuento real',\n  descripcion: 'Tras un inventario: fija el stock al número contado. Solo el jefe (y el dueño), con motivo; la diferencia queda registrada.',\n  acceso: PERSONAL,", tests: ['src/test/stock.test.ts'] },
  { regla: 'Darse de baja cancela las citas futuras', archivo: 'src/modulos/cuenta.ts', buscar: "const citas = await tx.cita.updateMany({ where: { cliente: { usuarioId: usuario.id }, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } }, data: { estado: 'CANCELADA' } });", poner: 'const citas = { count: 0 };', tests: ['src/test/baja.test.ts'] },
  { regla: 'Fichajes en orden (no dos entradas seguidas)', archivo: 'src/domain/jornada.ts', buscar: "ENTRADA: ['INICIO_PAUSA', 'SALIDA'],", poner: "ENTRADA: ['ENTRADA', 'INICIO_PAUSA', 'SALIDA'],", tests: ['src/test/jornada.test.ts'] },
  { regla: 'Los emails escapan lo que escribe el usuario (XSS)', archivo: 'src/emails/maqueta.ts', buscar: "    .replace(/</g, '&lt;')", poner: '', tests: ['src/test/emails.test.ts'] },
  { regla: 'Eliminar deja constancia con copia', archivo: 'src/servicios/constancias.ts', buscar: '  return tx.registroEliminacion.create({', poner: '  return Promise.resolve() || tx.registroEliminacion.create({', tests: ['src/test/cuenta.test.ts'] },
  { regla: 'Cuenta en autobaja: solo puede recuperarla o salir', archivo: 'src/lib/ruta.ts', buscar: '&& !def.permiteEnBaja) {', poner: '&& false) {', tests: ['src/test/baja.test.ts'] },
  { regla: 'Un jefe no da de baja a otro jefe', archivo: 'src/modulos/personal.ts', buscar: "if (e.usuario.rol === 'JEFE' && actor.rol !== 'DUENO')", poner: 'if (false)', tests: ['src/test/personal-bajas.test.ts'] },
  { regla: 'Km de salida nunca menos que los de entrada', archivo: 'src/modulos/ordenes.ts', buscar: 'if (kmSalida < kmEntrada) throw', poner: 'if (false) throw', tests: ['src/test/ordenes.test.ts'] },
  { regla: 'Fotos: se comprueba el contenido, no lo que dice el navegador', archivo: 'src/modulos/fotos.ts', buscar: "if (!Buffer.isBuffer(datos) || formatoReal(datos) !== req.headers['content-type']?.split(';')[0].trim().toLowerCase()) {", poner: 'if (!Buffer.isBuffer(datos)) {', tests: ['src/test/fotos.test.ts'] },
  { regla: 'Fotos: un cliente no ve las de otra orden', archivo: 'src/servicios/fotos.ts', buscar: 'esPersonal(u) || f.partida.solicitud.orden.cita.cliente.usuarioId === u.id', poner: 'true', tests: ['src/test/fotos.test.ts'] },
  { regla: 'Fotos: solo se adjuntan las propias y sueltas', archivo: 'src/servicios/fotos.ts', buscar: 'partidaId: null, subidaPorId: usuarioId }', poner: '}', tests: ['src/test/fotos.test.ts'] },
  { regla: 'Fotos: la limpieza solo borra las no adjuntas', archivo: 'src/servicios/fotos.ts', buscar: 'where: { partidaId: null, subidaEn: { lt: limite } }', poner: 'where: { subidaEn: { lt: limite } }', tests: ['src/test/fotos.test.ts'] },
  { regla: 'Ofrecer hueco: no se ofrece una franja llena', archivo: 'src/modulos/reservas.ts', buscar: 'if (llenas.length) return', poner: 'if (false) return', tests: ['src/test/agenda.test.ts'] },
  { regla: 'Recordatorio 24 h: una sola vez por cita, aunque corran dos procesos', archivo: 'src/servicios/recordatorios.ts', buscar: 'where: { id: citaId, recordatorioEn: null,', poner: 'where: { id: citaId,', tests: ['src/test/recordatorios.test.ts'] },
];

const raiz = join(__dirname, '..');
const originales = new Map<string, string>();
const restaurar = () => originales.forEach((c, f) => writeFileSync(f, c));
process.on('SIGINT', () => { restaurar(); process.exit(130); });

const filas: string[] = [];
let sobreviven = 0;
for (const [i, m] of M.entries()) {
  const ruta = join(raiz, m.archivo);
  const original = readFileSync(ruta, 'utf8');
  if (!original.includes(m.buscar)) {
    console.error(`✗ ${m.regla}: no encuentro el código a mutar en ${m.archivo}`);
    process.exit(2);
  }
  originales.set(ruta, original);
  try {
    writeFileSync(ruta, original.replace(m.buscar, m.poner));
    const r = spawnSync('npx', ['vitest', 'run', ...m.tests], { cwd: raiz, encoding: 'utf8' });
    const resumen = /Tests\s+(.+)/.exec(r.stdout)?.[1]?.replace(/\x1b\[[0-9;]*m/g, '').replace(/\|/g, '·').trim() ?? '¿?';
    const detectada = r.status !== 0;
    if (!detectada) sobreviven++;
    console.log(`${detectada ? '✓' : '✗'} ${i + 1}. ${m.regla} → ${resumen}`);
    filas.push(`| ${i + 1} | ${m.regla} | \`${m.archivo}\` | ${m.tests.map((t) => `\`${t.split('/').pop()}\``).join(', ')} | ${detectada ? '✓ falla' : '✗ **sigue en verde**'} (${resumen}) |`);
  } finally {
    writeFileSync(ruta, original);
    originales.delete(ruta);
  }
}

writeFileSync(
  join(raiz, '../../docs/mutaciones.md'),
  `# Pruebas de mutación («tests que deben fallar»)

Para comprobar que los tests protegen de verdad las reglas, el script \`apps/api/scripts/mutaciones.ts\`
rompe a propósito cada regla (una línea), ejecuta los tests que la cubren y exige que **fallen**.
Después restaura el código. Si alguno siguiera en verde, ese test no estaría protegiendo nada.

Ejecutar: \`npm run mutaciones -w api\`. Resultado de la última ejecución:

| # | Regla rota a propósito | Archivo | Tests | Resultado |
| --- | --- | --- | --- | --- |
${filas.join('\n')}

**${M.length - sobreviven} de ${M.length} mutaciones detectadas.**
`,
);
console.log(`\n${M.length - sobreviven}/${M.length} mutaciones detectadas`);
process.exit(sobreviven ? 1 : 0);
