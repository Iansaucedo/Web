import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import passport from 'passport';
import swaggerUi from 'swagger-ui-express';
import { idPeticion, exigirJson, manejarErrores, rutaNoEncontrada } from './middleware/errores';
import { montarRutas } from './lib/ruta';
import { documentoOpenApi } from './openapi/registro';
import { cargarModulos } from './modulos';
import { limitar } from './middleware/limite';

function saltosProxy() {
  const n = Number(process.env.TRUST_PROXY ?? 1);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
}

export function crearApp() {
  cargarModulos();
  const app = express();
  app.disable('x-powered-by');
  // Saltos de proxy delante de Express: 1 = solo Next (local o imagen única); 2 = Next en otro App Service
  // (el frontal de Azure de la API añade la IP de Next). Así `req.ip` es la del cliente, no la de un proxy.
  app.set('trust proxy', saltosProxy());
  app.set('query parser', 'simple'); // sin objetos anidados en la query: ?a[b]=1 no se convierte en objeto
  app.use(idPeticion);
  app.use(helmet({ contentSecurityPolicy: false })); // la CSP la pone Next; Swagger UI necesita scripts en línea
  app.use(express.json({ limit: '100kb', strict: true }));
  app.use(cookieParser());
  app.use(passport.initialize());

  const api = Router();
  api.use('/auth', limitar('acceso', 20));
  api.use(limitar('general', 600));
  api.use(exigirJson);
  montarRutas(api);

  // La documentación no se publica en producción salvo que se pida (API_DOCS=true).
  if (process.env.NODE_ENV !== 'production' || process.env.API_DOCS === 'true') {
    const documento = documentoOpenApi();
    app.get('/api/openapi.json', (_req, res) => res.json(documento));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(documento, { customSiteTitle: 'API del Taller' }));
  }
  app.use('/api', api);

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
