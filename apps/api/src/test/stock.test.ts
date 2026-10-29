import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { entrar, ordenEnReparacion, reiniciarBd } from './ayudas';

beforeEach(reiniciarBd);

async function piezaCon(stock: number) {
  const jefe = await entrar('jefe@taller.test', 'JEFE');
  const p = (await jefe.post('/api/piezas').send({ referencia: 'FA-010', nombre: 'Filtro de aceite', precioCentimos: 1200, stock })).body;
  return { jefe, p };
}

describe('registro de movimientos de stock', () => {
  it('el alta de una pieza deja su primer movimiento', async () => {
    const { jefe, p } = await piezaCon(5);
    const m = (await jefe.get(`/api/piezas/${p.id}/movimientos`)).body.datos;
    expect(m).toEqual([expect.objectContaining({ tipo: 'ALTA', delta: 5, stockAntes: 0, stockDespues: 5, usuario: 'jefe' })]);
  });

  it('ajustar exige motivo y deja quién, cuánto, antes y después', async () => {
    const { jefe, p } = await piezaCon(5);
    expect((await jefe.post(`/api/piezas/${p.id}/ajuste-stock`).send({ delta: -2 })).status).toBe(400);
    await jefe.post(`/api/piezas/${p.id}/ajuste-stock`).send({ delta: -2, motivo: 'Dos rotas al desembalar' });
    const m = (await jefe.get(`/api/piezas/${p.id}/movimientos`)).body.datos[0];
    expect(m).toMatchObject({ tipo: 'AJUSTE', delta: -2, stockAntes: 5, stockDespues: 3, motivo: 'Dos rotas al desembalar' });
  });

  it('cuadrar fija el recuento real del inventario y registra la diferencia', async () => {
    const { jefe, p } = await piezaCon(5);
    const r = await jefe.post(`/api/piezas/${p.id}/cuadre`).send({ stockReal: 8, motivo: 'Inventario de noviembre' });
    expect(r.status).toBe(200);
    expect(r.body.stock).toBe(8);
    const m = (await jefe.get(`/api/piezas/${p.id}/movimientos`)).body.datos[0];
    expect(m).toMatchObject({ tipo: 'CUADRE', delta: 3, stockAntes: 5, stockDespues: 8, motivo: 'Inventario de noviembre' });
  });

  it('QA: cuadrar con un número negativo o sin motivo: 400 y el stock no cambia', async () => {
    const { jefe, p } = await piezaCon(5);
    expect((await jefe.post(`/api/piezas/${p.id}/cuadre`).send({ stockReal: -1, motivo: 'x' })).status).toBe(400);
    expect((await jefe.post(`/api/piezas/${p.id}/cuadre`).send({ stockReal: 3 })).status).toBe(400);
    expect((await prisma.pieza.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(5);
  });

  it('el mecánico no ajusta, no cuadra ni ve el historial', async () => {
    const { p } = await piezaCon(5);
    const mec = await entrar('mec9@taller.test', 'MECANICO');
    expect((await mec.post(`/api/piezas/${p.id}/ajuste-stock`).send({ delta: 1, motivo: 'x' })).status).toBe(403);
    expect((await mec.post(`/api/piezas/${p.id}/cuadre`).send({ stockReal: 1, motivo: 'x' })).status).toBe(403);
    expect((await mec.get(`/api/piezas/${p.id}/movimientos`)).status).toBe(403);
  });

  it('usar una pieza en una reparación y recibir un pedido también quedan registrados', async () => {
    const { jefe, mec, partidas, pieza } = await ordenEnReparacion();
    await mec.post(`/api/partidas/${partidas[0].id}/piezas-usadas`).send({ piezaId: pieza.id, cantidad: 2 });
    const pedido = (await mec.post(`/api/partidas/${partidas[0].id}/pedidos`).send({ piezaId: pieza.id, cantidad: 4 })).body;
    await jefe.post(`/api/pedidos/${pedido.id}/aprobar`).send({});
    await jefe.post(`/api/pedidos/${pedido.id}/recibir`).send({});
    const m = (await jefe.get(`/api/piezas/${pieza.id}/movimientos`)).body.datos;
    expect(m.map((x: { tipo: string; delta: number }) => `${x.tipo}${x.delta}`)).toEqual(['RECEPCION4', 'USO-2']);
    expect(m[1]).toMatchObject({ stockAntes: 3, stockDespues: 1, ordenCodigo: 'OR-0001' });
  });

  it('el historial reconstruye el stock actual', async () => {
    const { jefe, p } = await piezaCon(5);
    await jefe.post(`/api/piezas/${p.id}/ajuste-stock`).send({ delta: 3, motivo: 'Compra' });
    await jefe.post(`/api/piezas/${p.id}/cuadre`).send({ stockReal: 6, motivo: 'Inventario' });
    const m = (await jefe.get(`/api/piezas/${p.id}/movimientos`)).body.datos;
    expect(m.reduce((s: number, x: { delta: number }) => s + x.delta, 0)).toBe((await prisma.pieza.findUniqueOrThrow({ where: { id: p.id } })).stock);
  });
});

describe('eliminar piezas con constancia', () => {
  it('una pieza nunca usada se borra y queda copia', async () => {
    const { jefe, p } = await piezaCon(0);
    expect((await jefe.delete(`/api/piezas/${p.id}`).send({ motivo: 'Duplicada' })).status).toBe(204);
    expect(await prisma.pieza.count()).toBe(0);
    expect(await prisma.registroEliminacion.findFirstOrThrow()).toMatchObject({ entidad: 'Pieza', modo: 'BORRADO', motivo: 'Duplicada' });
  });

  it('una pieza ya usada en reparaciones se da de baja (no se borra) y sale del catálogo', async () => {
    const { jefe, mec, partidas, pieza } = await ordenEnReparacion();
    await mec.post(`/api/partidas/${partidas[0].id}/piezas-usadas`).send({ piezaId: pieza.id, cantidad: 1 });
    expect((await jefe.delete(`/api/piezas/${pieza.id}`).send({})).status).toBe(204);
    expect((await prisma.pieza.findUniqueOrThrow({ where: { id: pieza.id } })).activa).toBe(false);
    expect(await prisma.piezaUsada.count()).toBe(1);
    expect((await jefe.get('/api/piezas')).body.datos.find((x: { id: string }) => x.id === pieza.id)).toBeUndefined();
    expect((await prisma.registroEliminacion.findFirstOrThrow()).modo).toBe('BAJA');
  });

  it('el mecánico no elimina piezas', async () => {
    const { p } = await piezaCon(0);
    const mec = await entrar('mec9@taller.test', 'MECANICO');
    expect((await mec.delete(`/api/piezas/${p.id}`).send({})).status).toBe(403);
  });
});

describe('categoría, stock mínimo y movimientos del día', () => {
  it('cada pieza tiene su propio stock mínimo; «stock bajo» lo usa', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const bujia = (await jefe.post('/api/piezas').send({ referencia: 'NGK-1', nombre: 'Bujía', categoria: 'ENCENDIDO', precioCentimos: 680, stock: 4, stockMinimo: 4 })).body;
    await jefe.post('/api/piezas').send({ referencia: 'FA-1', nombre: 'Filtro', categoria: 'FILTROS', precioCentimos: 1200, stock: 4, stockMinimo: 2 });
    expect(bujia).toMatchObject({ categoria: 'ENCENDIDO', stockMinimo: 4, stockBajo: true });
    const bajos = (await jefe.get('/api/piezas?stockBajo=true')).body.datos.map((p: { referencia: string }) => p.referencia);
    expect(bajos).toEqual(['NGK-1']);
    expect((await jefe.get('/api/piezas?categoria=FILTROS')).body.datos).toHaveLength(1);
    expect((await jefe.patch(`/api/piezas/${bujia.id}`).send({ stockMinimo: 1 })).body.stockBajo).toBe(false);
  });

  it('QA: categoría inexistente o stock mínimo negativo: 400', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    expect((await jefe.post('/api/piezas').send({ referencia: 'X-1', nombre: 'X', categoria: 'COHETES', precioCentimos: 1, stock: 0 })).status).toBe(400);
    expect((await jefe.post('/api/piezas').send({ referencia: 'X-1', nombre: 'X', precioCentimos: 1, stock: 0, stockMinimo: -1 })).status).toBe(400);
  });

  it('el panel «Movimientos de hoy» lista los cambios de stock del día de todas las piezas', async () => {
    const { jefe, p } = await piezaCon(5);
    await jefe.post(`/api/piezas/${p.id}/ajuste-stock`).send({ delta: -1, motivo: 'Rota' });
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
    const r = (await jefe.get(`/api/movimientos-stock?fecha=${hoy}`)).body.datos;
    expect(r.map((m: { tipo: string; pieza: string }) => `${m.tipo}:${m.pieza}`)).toEqual(['AJUSTE:Filtro de aceite', 'ALTA:Filtro de aceite']);
    const mec = await entrar('mec9@taller.test', 'MECANICO');
    expect((await mec.get(`/api/movimientos-stock?fecha=${hoy}`)).status).toBe(403);
  });
});
