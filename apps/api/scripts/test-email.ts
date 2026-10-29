import { verificarConexionSmtp, transporteSmtp } from '../src/emails/transporte';

async function main() {
  const destinatario = process.argv[2] || process.env.OWNER_EMAIL;

  console.log('--- Comprobación de Configuración SMTP ---');
  console.log(`SMTP_HOST: ${process.env.SMTP_HOST || '(no definido)'}`);
  console.log(`SMTP_PORT: ${process.env.SMTP_PORT || '587 (por defecto)'}`);
  console.log(`SMTP_SECURE: ${process.env.SMTP_SECURE || 'auto'}`);
  console.log(`SMTP_USER: ${process.env.SMTP_USER ? '***' : '(sin usuario)'}`);
  console.log(`SMTP_FROM: ${process.env.SMTP_FROM || 'TallerPro <no-responder@taller.local>'}`);
  console.log('------------------------------------------');

  if (!destinatario) {
    console.error('Error: Debes indicar una dirección de correo de destino:');
    console.error('  npx tsx scripts/test-email.ts usuario@ejemplo.com');
    console.error('  O definir OWNER_EMAIL en .env');
    process.exit(1);
  }

  console.log('1. Verificando conexión SMTP con el servidor...');
  const verificacion = await verificarConexionSmtp();
  if (!verificacion.ok) {
    console.error(`❌ Fallo en la verificación: ${verificacion.mensaje}`);
    console.log('\nSugerencias:');
    console.log('- En Azure App Service el puerto 25 está bloqueado por seguridad.');
    console.log('- Usa el puerto 587 (STARTTLS) o el puerto 465 (TLS/SSL con SMTP_SECURE=true).');
    console.log('- Revisa las credenciales de SMTP_USER y SMTP_PASS.');
    process.exit(1);
  }
  console.log(`✅ ${verificacion.mensaje}`);

  console.log(`\n2. Enviando email de prueba a: ${destinatario}...`);
  try {
    const transporte = transporteSmtp();
    await transporte.enviar({
      para: destinatario,
      asunto: 'TallerPro - Correo de prueba de configuración SMTP',
      texto: 'Hola,\n\nSi recibes este correo, la configuración de envío de emails en TallerPro (Azure / SMTP) está funcionando correctamente.\n\nFecha: ' + new Date().toISOString(),
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #1976d2; margin-top: 0;">TallerPro</h2>
          <p>¡Hola!</p>
          <p>Si recibes este correo, significa que la configuración del servicio de email en <strong>Azure / SMTP</strong> está funcionando correctamente.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #666;">
            Enviado el ${new Date().toLocaleString()} desde TallerPro.
          </p>
        </div>
      `,
    });
    console.log('✅ Correo de prueba enviado con éxito.');
  } catch (error) {
    console.error('❌ Error enviando el correo:', (error as Error).message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fallo inesperado:', err);
  process.exit(1);
});
