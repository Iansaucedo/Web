import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los tests de integración comparten una base de datos real: se ejecutan de uno en uno.
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://taller:taller@localhost:5432/taller_test',
      JWT_SECRET: 'secreto-de-tests-0123456789',
      PUBLIC_WEB_URL: 'http://localhost:3000',
      CORREO_TRANSPORTE: 'memoria',
    },
  },
});
