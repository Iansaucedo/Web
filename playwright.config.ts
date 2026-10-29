import { defineConfig, devices } from '@playwright/test';

// E2E contra la app real: API en modo test (base de datos taller_e2e) y Next compilado.
// Una sola base de datos compartida → un test cada vez; cada test la reinicia.
const API = 'http://localhost:4100';
const WEB = 'http://localhost:3100';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-informe' }]],
  use: {
    baseURL: WEB,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] }, testIgnore: /movil\.spec\.ts/ },
    { name: 'movil', use: { ...devices['Pixel 7'] }, testMatch: /movil\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'npx tsx src/server.ts',
      cwd: 'apps/api',
      url: `${API}/api/ready`,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        PORT: '4100',
        DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql://taller:taller@localhost:5432/taller_e2e',
        JWT_SECRET: 'secreto-e2e-0123456789abcdef',
        PUBLIC_WEB_URL: WEB,
        CORREO_TRANSPORTE: 'memoria',
      },
    },
    {
      // Las rewrites de Next se fijan al compilar: por eso se compila con la URL de la API de pruebas.
      command: 'npx next build && npx next start -p 3100',
      cwd: 'apps/web',
      url: `${WEB}/login`,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: { API_INTERNAL_URL: API, NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],
});
