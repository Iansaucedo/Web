import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.OWNER_EMAIL;
  if (!email) throw new Error('Falta OWNER_EMAIL');

  await prisma.usuario.upsert({
    where: { email },
    update: { rol: 'DUENO' },
    create: { email, nombre: 'Dueño', rol: 'DUENO' },
  });

  await prisma.configTaller.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  for (const nombre of ['Puesto 1', 'Puesto 2', 'Puesto 3']) {
    await prisma.puesto.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
