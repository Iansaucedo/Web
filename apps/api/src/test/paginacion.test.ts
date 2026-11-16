import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { GOLF, entrar, reiniciarBd } from './ayudas';

beforeEach(reiniciarBd);

/** Ana con `n` vehículos: 0001AAA, 0002AAA… (todos de la misma marca, para probar el desempate). */
async function anaConVehiculos(n: number) {
  const ana = await entrar('ana@cliente.test');
  for (let i = 1; i <= n; i++) {
    const r = await ana.post('/api/vehiculos').send({ ...GOLF, matricula: `${String(i).padStart(4, '0')}AAA`, kilometros: i * 1000 });
    expect(r.status).toBe(201);
  }
  return ana;
}
const matriculas = (r: { body: { datos: { matricula: string }[] } }) => r.body.datos.map((v) => v.matricula);

describe('paginación de los listados', () => {
  it('por defecto 25 por página, con el total y el número de páginas; nada se corta en silencio', async () => {
    const ana = await anaConVehiculos(30);
    const p1 = await ana.get('/api/vehiculos');
    expect(p1.status).toBe(200);
    expect(p1.body).toMatchObject({ total: 30, pagina: 1, porPagina: 25, paginas: 2 });
    expect(p1.body.datos).toHaveLength(25);
    const p2 = await ana.get('/api/vehiculos?pagina=2');
    expect(p2.body).toMatchObject({ total: 30, pagina: 2, paginas: 2 });
    expect(new Set([...matriculas(p1), ...matriculas(p2)]).size).toBe(30);
    // Más allá de la última página: vacía, con el total real (la web vuelve a la última).
    const p9 = await ana.get('/api/vehiculos?pagina=9');
    expect(p9.body).toMatchObject({ datos: [], total: 30, pagina: 9, paginas: 2 });
  });

  it('tamaños de página 10, 25, 50 y 100; cualquier otro es un 400', async () => {
    const ana = await anaConVehiculos(12);
    for (const [n, paginas] of [[10, 2], [25, 1], [50, 1], [100, 1]] as const) {
      const r = await ana.get(`/api/vehiculos?porPagina=${n}`);
      expect(r.body).toMatchObject({ porPagina: n, paginas });
    }
    for (const malo of ['porPagina=7', 'porPagina=1000', 'pagina=0', 'pagina=-1', 'pagina=abc', 'orden=clienteId', 'dir=arriba']) {
      expect((await ana.get(`/api/vehiculos?${malo}`)).status).toBe(400);
    }
  });

  it('ordena por el campo pedido en los dos sentidos', async () => {
    const ana = await anaConVehiculos(5);
    expect(matriculas(await ana.get('/api/vehiculos?orden=matricula&dir=desc'))).toEqual(['0005AAA', '0004AAA', '0003AAA', '0002AAA', '0001AAA']);
    expect(matriculas(await ana.get('/api/vehiculos?orden=kilometros&dir=asc'))).toEqual(['0001AAA', '0002AAA', '0003AAA', '0004AAA', '0005AAA']);
  });

  it('QA: con valores repetidos en el campo de orden, ninguna fila sale en dos páginas ni se pierde', async () => {
    const ana = await anaConVehiculos(23);
    const vistas: string[] = [];
    for (let p = 1; p <= 3; p++) vistas.push(...matriculas(await ana.get(`/api/vehiculos?orden=marca&porPagina=10&pagina=${p}`)));
    expect(vistas).toHaveLength(23);
    expect(new Set(vistas).size).toBe(23);
  });

  it('los filtros cuentan en el total; los usuarios se filtran por estado y se ordenan por email', async () => {
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    for (const e of ['c@x.es', 'a@x.es', 'b@x.es']) await entrar(e);
    await prisma.usuario.update({ where: { email: 'b@x.es' }, data: { activo: false } });
    const r = await dueno.get('/api/usuarios?rol=CLIENTE&activo=true&orden=email&dir=desc');
    expect(r.body).toMatchObject({ total: 2, paginas: 1 });
    expect(r.body.datos.map((u: { email: string }) => u.email)).toEqual(['c@x.es', 'a@x.es']);
  });

  it('los avisos se paginan y el número de no leídos es el total, no el de la página', async () => {
    const ana = await entrar('ana@cliente.test', 'CLIENTE', { sinPerfil: true });
    await prisma.notificacion.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ usuarioId: ana.usuarioId, tipo: 'X', mensaje: `aviso ${i}`, creadaEn: new Date(Date.UTC(2026, 10, 1, 0, i)) })) });
    const r = await ana.get('/api/notificaciones?porPagina=10');
    expect(r.body).toMatchObject({ total: 30, paginas: 3, noLeidas: 30 });
    expect(r.body.datos[0].mensaje).toBe('aviso 29');
  });
});
