import http from 'node:http';
import { createRouter, HttpError } from './http.js';
import { NotFound, Conflict } from './service.js';
import { RuleError, STATUSES } from './rules.js';
import { renderReport } from './report.js';

export function createApi(service) {
  const router = createRouter();
  const route = (method, path, handler) => router.add(method, path, wrap(handler));

  route('GET', '/templates', () => ({ body: service.listTemplates() }));

  route('GET', '/projects', () => ({ body: service.listProjects() }));

  route('POST', '/projects', ({ body }) => {
    const name = requiredText(body, 'name');
    const client = requiredText(body, 'client');
    return { status: 201, body: service.createProject({ name, client, site: body.site?.trim() || null }) };
  });

  route('GET', '/projects/:id', ({ params }) => ({ body: service.getProject(id(params.id)) }));

  route('POST', '/projects/:id/systems', ({ params, body }) => {
    const template = requiredText(body, 'template');
    return { status: 201, body: service.addSystem(id(params.id), { template, label: body.label?.trim() }) };
  });

  route('POST', '/projects/:id/conclude', ({ params }) => ({ body: service.conclude(id(params.id)) }));

  route('GET', '/projects/:id/report', ({ params }) => {
    const project = service.getProject(id(params.id));
    const itemsBySystem = new Map(project.systems.map((s) => [s.id, service.systemItems(s.id)]));
    return { text: renderReport(project, itemsBySystem), contentType: 'text/markdown' };
  });

  route('GET', '/systems/:id/items', ({ params, query }) => {
    const status = query.get('status') ?? undefined;
    if (status && !STATUSES.includes(status)) throw new HttpError(400, `status inválido. Use: ${STATUSES.join(', ')}`);
    return { body: service.systemItems(id(params.id), status) };
  });

  route('PATCH', '/items/:id', ({ params, body }) => ({ body: service.inspect(id(params.id), body) }));

  route('GET', '/items/:id/history', ({ params }) => ({ body: service.history(id(params.id)) }));

  return http.createServer(router.handle);
}

// Traduz erros de domínio para status HTTP num lugar só.
function wrap(handler) {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (err) {
      if (err instanceof NotFound) throw new HttpError(404, err.message);
      if (err instanceof Conflict) throw new HttpError(409, err.message, err.details);
      if (err instanceof RuleError) throw new HttpError(422, err.message);
      throw err;
    }
  };
}

function id(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'id inválido');
  return n;
}

function requiredText(body, field) {
  const value = body?.[field];
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `"${field}" é obrigatório`);
  return value.trim();
}
