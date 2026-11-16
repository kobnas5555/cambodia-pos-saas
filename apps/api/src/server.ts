import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './db/prisma';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Cambodia POS API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

