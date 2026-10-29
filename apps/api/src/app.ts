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

export function crearApp() {
  cargarModulos();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // detrás del proxy de Next y del balanceador de Azure
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

  const documento = documentoOpenApi();
  app.get('/api/openapi.json', (_req, res) => res.json(documento));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(documento, { customSiteTitle: 'API del Taller' }));
  app.use('/api', api);

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
