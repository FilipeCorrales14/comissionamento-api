import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { loadTemplates } from '../src/templates.js';
import { Commissioning } from '../src/service.js';
import { createApi } from '../src/api.js';

let server;
let base;

before(async () => {
  const service = new Commissioning(openDb(), loadTemplates(), { now: () => '2026-10-30T12:00:00.000Z' });
  server = createApi(service);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') ?? '';
  const data = res.status === 204 ? null : type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

test('lista os modelos de checklist', async () => {
  const { data } = await call('GET', '/templates');
  assert.deepEqual(data.map((t) => t.key).sort(), ['cftv', 'controle-acesso', 'sdai']);
});

test('fluxo completo: criar, inspecionar, bloquear, corrigir, concluir', async () => {
  const project = (await call('POST', '/projects', { name: 'Galpão Logístico', client: 'ACME', site: 'Canoas/RS' })).data;
  const system = (await call('POST', `/projects/${project.id}/systems`, { template: 'cftv', label: 'CFTV Doca' })).data;

  const items = (await call('GET', `/systems/${system.id}/items`)).data;
  assert.equal(items.length, 11);
  assert.equal(items[0].code, 'CFTV-01');

  // Aprova tudo, menos um item que é reprovado.
  for (const item of items) {
    const body = { status: 'aprovado', inspector: 'Filipe' };
    if (item.evidenceRequired) body.evidence = [`fotos/${item.code}.jpg`];
    if (item.code === 'CFTV-05') Object.assign(body, { status: 'reprovado', note: 'NVR com senha de fábrica' });
    const r = await call('PATCH', `/items/${item.id}`, body);
    assert.equal(r.status, 200, `${item.code}: ${JSON.stringify(r.data)}`);
  }

  const blocked = await call('POST', `/projects/${project.id}/conclude`);
  assert.equal(blocked.status, 409);
  assert.deepEqual(blocked.data.blockers.map((b) => b.code), ['CFTV-05']);

  const report = await call('GET', `/projects/${project.id}/report`);
  assert.match(report.data, /## Pendências para correção/);
  assert.match(report.data, /CFTV-05\*\* \(CFTV Doca\): NVR com senha de fábrica/);

  const failed = items.find((i) => i.code === 'CFTV-05');
  await call('PATCH', `/items/${failed.id}`, { status: 'aprovado', inspector: 'Filipe', note: 'senha alterada' });

  const history = (await call('GET', `/items/${failed.id}/history`)).data;
  assert.deepEqual(history.map((h) => h.status), ['reprovado', 'aprovado']);

  const done = await call('POST', `/projects/${project.id}/conclude`);
  assert.equal(done.status, 200);
  assert.equal(done.data.status, 'concluido');
  assert.equal(done.data.progress.percent, 100);

  // Depois de concluído, nada muda.
  const late = await call('PATCH', `/items/${failed.id}`, { status: 'reprovado', inspector: 'X', note: 'y' });
  assert.equal(late.status, 409);
  const extra = await call('POST', `/projects/${project.id}/systems`, { template: 'sdai' });
  assert.equal(extra.status, 409);
});

test('regra de negócio violada retorna 422', async () => {
  const project = (await call('POST', '/projects', { name: 'P', client: 'C' })).data;
  const system = (await call('POST', `/projects/${project.id}/systems`, { template: 'sdai' })).data;
  const [first] = (await call('GET', `/systems/${system.id}/items`)).data;
  const r = await call('PATCH', `/items/${first.id}`, { status: 'aprovado', inspector: 'F' });
  assert.equal(r.status, 422);
  assert.match(r.data.error, /evidência/);
});

test('validações de entrada e recursos inexistentes', async () => {
  assert.equal((await call('POST', '/projects', { name: 'Sem cliente' })).status, 400);
  assert.equal((await call('GET', '/projects/999')).status, 404);
  const project = (await call('POST', '/projects', { name: 'P', client: 'C' })).data;
  assert.equal((await call('POST', `/projects/${project.id}/systems`, { template: 'nao-existe' })).status, 404);
  assert.equal((await call('GET', '/systems/1/items?status=feito')).status, 400);
  assert.equal((await call('PATCH', '/items/0', {})).status, 400);
});

test('não conclui projeto sem sistemas', async () => {
  const project = (await call('POST', '/projects', { name: 'Vazio', client: 'C' })).data;
  const r = await call('POST', `/projects/${project.id}/conclude`);
  assert.equal(r.status, 409);
});
