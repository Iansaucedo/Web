# Pruebas de mutación («tests que deben fallar»)

Para comprobar que los tests protegen de verdad las reglas, el script `apps/api/scripts/mutaciones.ts`
rompe a propósito cada regla (una línea), ejecuta los tests que la cubren y exige que **fallen**.
Después restaura el código. Si alguno siguiera en verde, ese test no estaría protegiendo nada.

Ejecutar: `npm run mutaciones -w api`. Resultado de la última ejecución:

| # | Regla rota a propósito | Archivo | Tests | Resultado |
| --- | --- | --- | --- | --- |
| 1 | Autenticación: el JWT se verifica con la clave y el algoritmo | `src/middleware/auth.ts` | `plataforma.test.ts` | ✓ falla (3 failed · 20 passed (23)) |
| 2 | Autorización por rol en el servidor | `src/lib/ruta.ts` | `cuenta.test.ts` | ✓ falla (2 failed · 24 passed (26)) |
| 3 | Un cliente no accede a vehículos de otro (404) | `src/servicios/acceso.ts` | `cuenta.test.ts` | ✓ falla (2 failed · 24 passed (26)) |
| 4 | CSRF: las peticiones con cuerpo deben ser JSON (415) | `src/middleware/errores.ts` | `plataforma.test.ts` | ✓ falla (1 failed · 22 passed (23)) |
| 5 | Límite de tamaño del cuerpo (413) | `src/app.ts` | `plataforma.test.ts` | ✓ falla (1 failed · 22 passed (23)) |
| 6 | Query estricta: parámetros desconocidos dan 400 | `src/lib/ruta.ts` | `plataforma.test.ts` | ✓ falla (1 failed · 22 passed (23)) |
| 7 | Capacidad: dos clientes no se quedan la misma última plaza (cerrojo) | `src/modulos/citas.ts` | `agenda.test.ts` | ✓ falla (1 failed · 39 passed (40)) |
| 8 | Cancelar con 24 h exactas sí se permite (límite incluido) | `src/domain/capacidad.ts` | `agenda.test.ts`, `dominio.test.ts` | ✓ falla (2 failed · 48 passed (50)) |
| 9 | Doble clic: la Idempotency-Key no repite la operación | `src/middleware/idempotencia.ts` | `agenda.test.ts` | ✓ falla (2 failed · 38 passed (40)) |
| 10 | El cliente debe decidir todos los trabajos de una vez | `src/domain/respuesta.ts` | `ordenes.test.ts`, `respuesta.test.ts` | ✓ falla (2 failed · 43 passed (45)) |
| 11 | No se completa con trabajos sin terminar | `src/domain/respuesta.ts` | `ordenes.test.ts` | ✓ falla (1 failed · 37 passed (38)) |
| 12 | El stock nunca queda negativo | `src/servicios/stock.ts` | `ordenes.test.ts`, `stock.test.ts` | ✓ falla (3 failed · 48 passed (51)) |
| 13 | Todo cambio de stock queda registrado | `src/servicios/stock.ts` | `stock.test.ts` | ✓ falla (6 failed · 7 passed (13)) |
| 14 | Solo el jefe (o el dueño) cuadra el stock | `src/modulos/piezas.ts` | `stock.test.ts` | ✓ falla (1 failed · 12 passed (13)) |
| 15 | Darse de baja cancela las citas futuras | `src/modulos/cuenta.ts` | `baja.test.ts` | ✓ falla (1 failed · 9 passed (10)) |
| 16 | Fichajes en orden (no dos entradas seguidas) | `src/domain/jornada.ts` | `jornada.test.ts` | ✓ falla (2 failed · 12 passed (14)) |
| 17 | Los emails escapan lo que escribe el usuario (XSS) | `src/emails/maqueta.ts` | `emails.test.ts` | ✓ falla (1 failed · 39 passed (40)) |
| 18 | Eliminar deja constancia con copia | `src/servicios/constancias.ts` | `cuenta.test.ts` | ✓ falla (3 failed · 23 passed (26)) |
| 19 | Cuenta en autobaja: solo puede recuperarla o salir | `src/lib/ruta.ts` | `baja.test.ts` | ✓ falla (1 failed · 9 passed (10)) |
| 20 | Un jefe no da de baja a otro jefe | `src/modulos/personal.ts` | `personal-bajas.test.ts` | ✓ falla (1 failed · 7 passed (8)) |
| 21 | Km de salida nunca menos que los de entrada | `src/modulos/ordenes.ts` | `ordenes.test.ts` | ✓ falla (2 failed · 36 passed (38)) |
| 22 | Fotos: se comprueba el contenido, no lo que dice el navegador | `src/modulos/fotos.ts` | `fotos.test.ts` | ✓ falla (1 failed · 11 passed (12)) |
| 23 | Fotos: un cliente no ve las de otra orden | `src/servicios/fotos.ts` | `fotos.test.ts` | ✓ falla (1 failed · 11 passed (12)) |
| 24 | Fotos: solo se adjuntan las propias y sueltas | `src/servicios/fotos.ts` | `fotos.test.ts` | ✓ falla (2 failed · 10 passed (12)) |
| 25 | Fotos: la limpieza solo borra las no adjuntas | `src/servicios/fotos.ts` | `fotos.test.ts` | ✓ falla (1 failed · 11 passed (12)) |
| 26 | Ofrecer hueco: no se ofrece una franja llena | `src/modulos/reservas.ts` | `agenda.test.ts` | ✓ falla (2 failed · 38 passed (40)) |
| 27 | Recordatorio 24 h: una sola vez por cita, aunque corran dos procesos | `src/servicios/recordatorios.ts` | `recordatorios.test.ts` | ✓ falla (1 failed · 2 passed (3)) |

**27 de 27 mutaciones detectadas.**
