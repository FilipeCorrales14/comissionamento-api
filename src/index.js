import { openDb } from './db.js';
import { loadTemplates } from './templates.js';
import { Commissioning } from './service.js';
import { createApi } from './api.js';

const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? 'comissionamento.db';

const templates = loadTemplates(process.env.TEMPLATES_DIR);
const service = new Commissioning(openDb(DB_PATH), templates);
const server = createApi(service);

server.listen(PORT, () => {
  console.log(`API de comissionamento na porta ${PORT} (${templates.size} modelos carregados)`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
