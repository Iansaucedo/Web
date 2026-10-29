import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Una sola vez para todo el proyecto: añade `.openapi()` a los esquemas y pone los mensajes en español.
extendZodWithOpenApi(z);
z.config(z.locales.es());

export { z };
