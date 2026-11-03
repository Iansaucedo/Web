const { spawn } = require('node:child_process');

const api = spawn('node', ['apps/api/dist/server.js'], {
  env: { ...process.env, API_PORT: '4000', PORT: '4000' },
  stdio: 'inherit',
});

let web;
let cerrado = false;

function terminar(codigo) {
  if (cerrado) return;
  cerrado = true;
  if (web && web.exitCode === null) web.kill('SIGTERM');
  if (api.exitCode === null) api.kill('SIGTERM');
  process.exitCode = codigo;
}

api.once('error', (error) => {
  console.error('No se pudo iniciar la API:', error);
  terminar(1);
});

api.once('exit', (codigo, senal) => {
  if (!cerrado) {
    console.error(`La API terminó inesperadamente (${senal ?? codigo})`);
    terminar(codigo || 1);
  }
});

async function esperarApi() {
  const limite = Date.now() + 60_000;
  while (Date.now() < limite) {
    if (api.exitCode !== null) throw new Error('La API terminó antes de estar lista');
    try {
      const respuesta = await fetch('http://127.0.0.1:4000/api/health');
      if (respuesta.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('La API no estuvo lista en 60 segundos');
}

async function iniciar() {
  try {
    await esperarApi();
  } catch (error) {
    console.error(error);
    terminar(1);
    return;
  }

  web = spawn('node', ['apps/web/server.js'], {
    env: { ...process.env, HOSTNAME: '0.0.0.0', PORT: '3000' },
    stdio: 'inherit',
  });
  web.once('error', (error) => {
    console.error('No se pudo iniciar la web:', error);
    terminar(1);
  });
  web.once('exit', (codigo, senal) => {
    if (!cerrado) {
      console.error(`La web terminó inesperadamente (${senal ?? codigo})`);
      terminar(codigo || 1);
    }
  });
}

for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => terminar(0));
}

void iniciar();
