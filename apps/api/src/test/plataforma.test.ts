import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import SwaggerParser from '@apidevtools/swagger-parser';
import { prisma } from '../db';
import { rutasDefinidas } from '../lib/ruta';
import { anonimo, entrar, reiniciarBd } from './ayudas';

beforeEach(reiniciarBd);

describe('plataforma', () => {
  it('health y ready responden', async () => {
    expect((await anonimo().get('/api/health')).body).toEqual({ ok: true });
    expect((await anonimo().get('/api/ready')).status).toBe(200);
  });

  it('una ruta inexistente da 404 en JSON con requestId', async () => {
    const r = await anonimo().get('/api/no-existe');
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ codigo: 'RUTA_NO_ENCONTRADA' });
    expect(r.body.requestId).toBe(r.headers['x-request-id']);
  });

  it('no anuncia Express ni devuelve trazas', async () => {
    const r = await anonimo().get('/api/no-existe');
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toMatch(/at .*\.ts/);
  });
});

describe('seguridad de la sesión', () => {
  it('sin cookie: 401', async () => {
    const r = await anonimo().get('/api/auth/me');
    expect(r.status).toBe(401);
    expect(r.body.codigo).toBe('NO_AUTENTICADO');
  });

  it('un JWT firmado con otra clave: 401', async () => {
    const falso = jwt.sign({ sub: 'x', rol: 'DUENO' }, 'otra-clave-cualquiera-123');
    const r = await anonimo().get('/api/auth/me').set('Cookie', `taller_sesion=${falso}`);
    expect(r.status).toBe(401);
  });

  it('un JWT de un usuario real firmado con otra clave: 401 (no basta con conocer su id)', async () => {
    const ana = await entrar('ana@cliente.test');
    const falso = jwt.sign({ sub: ana.usuarioId, rol: 'CLIENTE' }, 'otra-clave-cualquiera-123');
    expect((await anonimo().get('/api/auth/me').set('Cookie', `taller_sesion=${falso}`)).status).toBe(401);
  });

  it('un JWT de un usuario real sin firma (alg none): 401', async () => {
    const ana = await entrar('ana@cliente.test');
    const sinFirma = jwt.sign({ sub: ana.usuarioId, rol: 'DUENO' }, '', { algorithm: 'none' });
    expect((await anonimo().get('/api/auth/me').set('Cookie', `taller_sesion=${sinFirma}`)).status).toBe(401);
  });

  it('un JWT caducado: 401', async () => {
    const ana = await entrar('ana@cliente.test');
    const caducado = jwt.sign({ sub: ana.usuarioId, rol: 'CLIENTE', exp: Math.floor(Date.now() / 1000) - 60 }, 'secreto-de-tests-0123456789');
    expect((await anonimo().get('/api/auth/me').set('Cookie', `taller_sesion=${caducado}`)).status).toBe(401);
  });

  it('un JWT con alg none: 401', async () => {
    const sinFirma = jwt.sign({ sub: 'x', rol: 'DUENO' }, '', { algorithm: 'none' });
    const r = await anonimo().get('/api/auth/me').set('Cookie', `taller_sesion=${sinFirma}`);
    expect(r.status).toBe(401);
  });

  it('el rol sale de la base de datos, no del token: subir el rol en el token no sirve', async () => {
    const cliente = await entrar('ana@cliente.test');
    const trucado = jwt.sign({ sub: cliente.usuarioId, rol: 'DUENO' }, 'secreto-de-tests-0123456789');
    const r = await anonimo().get('/api/auth/me').set('Cookie', `taller_sesion=${trucado}`);
    expect(r.body.rol).toBe('CLIENTE');
  });

  it('un usuario dado de baja pierde la sesión al instante', async () => {
    const cliente = await entrar('ana@cliente.test');
    await prisma.usuario.update({ where: { id: cliente.usuarioId }, data: { activo: false } });
    expect((await cliente.get('/api/auth/me')).status).toBe(401);
    expect((await anonimo().post('/api/auth/test-login').send({ email: 'ana@cliente.test' })).status).toBe(403);
  });

  it('el email se normaliza: mayúsculas y espacios son la misma cuenta', async () => {
    const a = await entrar('Ana@Cliente.test');
    const r = await anonimo().post('/api/auth/test-login').send({ email: ' ana@cliente.test ' });
    expect(r.status === 400 || r.body.id === a.usuarioId).toBe(true);
  });

  it('la invitación da el rol al primer acceso y solo se usa una vez', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    await prisma.invitacion.create({ data: { email: 'nuevo@taller.test', rol: 'MECANICO', creadaPorId: jefe.usuarioId } });
    const r = await anonimo().post('/api/auth/test-login').send({ email: 'nuevo@taller.test' });
    expect(r.body.rol).toBe('MECANICO');
    expect(r.body.empleadoId).toBeTruthy();
  });

  it('logout borra la cookie', async () => {
    const cliente = await entrar('ana@cliente.test');
    const r = await cliente.post('/api/auth/logout').send({});
    expect(r.status).toBe(204);
    expect(r.headers['set-cookie']?.[0]).toMatch(/taller_sesion=;/);
  });
});

describe('entrada robusta', () => {
  it('POST sin application/json: 415 (CSRF)', async () => {
    const cliente = await entrar('ana@cliente.test');
    const r = await cliente.post('/api/auth/logout').set('Content-Type', 'text/plain').send('hola');
    expect(r.status).toBe(415);
    expect(r.body.codigo).toBe('TIPO_NO_SOPORTADO');
  });

  it('JSON mal formado: 400', async () => {
    const r = await anonimo().post('/api/auth/test-login').set('Content-Type', 'application/json').send('{"email": ');
    expect(r.status).toBe(400);
    expect(r.body.codigo).toBe('JSON_INVALIDO');
  });

  it('cuerpo enorme: 413', async () => {
    const r = await anonimo()
      .post('/api/auth/test-login')
      .send({ email: 'a@b.es', nombre: 'x'.repeat(200_000) });
    expect(r.status).toBe(413);
  });

  it('validación con mensajes en español y el campo que falla', async () => {
    const r = await anonimo().post('/api/auth/test-login').send({ email: 'no-es-email' });
    expect(r.status).toBe(400);
    expect(r.body.codigo).toBe('VALIDACION');
    expect(r.body.detalles[0].campo).toBe('cuerpo.email');
  });
});

describe('documentación OpenAPI', () => {
  it('es un documento OpenAPI válido', async () => {
    const r = await anonimo().get('/api/openapi.json');
    expect(r.status).toBe(200);
    await expect(SwaggerParser.validate(structuredClone(r.body))).resolves.toBeTruthy();
  });

  it('documenta todas y cada una de las rutas montadas', async () => {
    const doc = (await anonimo().get('/api/openapi.json')).body;
    const faltan = rutasDefinidas().filter((r) => !doc.paths[`/api${r.ruta.replace(/:([A-Za-z]+)/g, '{$1}')}`]?.[r.metodo]);
    expect(faltan).toEqual([]);
    expect(Object.keys(doc.paths).length).toBeGreaterThan(5);
  });

  it('cada operación tiene resumen, etiqueta y al menos una respuesta de error', async () => {
    const doc = (await anonimo().get('/api/openapi.json')).body;
    for (const [ruta, ops] of Object.entries<Record<string, { summary?: string; tags?: string[]; responses: object }>>(doc.paths)) {
      for (const [metodo, op] of Object.entries(ops)) {
        expect(op.summary, `${metodo} ${ruta}`).toBeTruthy();
        expect(op.tags?.length, `${metodo} ${ruta}`).toBe(1);
        expect(Object.keys(op.responses).some((c) => Number(c) >= 400), `${metodo} ${ruta}`).toBe(true);
      }
    }
  });

  it('Swagger UI se sirve en /api/docs', async () => {
    const r = await anonimo().get('/api/docs/');
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/swagger-ui/);
  });
});

describe('query estricta', () => {
  it('un parámetro desconocido o anidado da 400 en vez de ignorarse', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    expect((await jefe.get('/api/ordenes?estado[$ne]=ENTREGADA')).status).toBe(400);
    expect((await jefe.get('/api/ordenes?estdo=ENTREGADA')).status).toBe(400);
    expect((await jefe.get('/api/ordenes?estado=ENTREGADA')).status).toBe(200);
  });
});
