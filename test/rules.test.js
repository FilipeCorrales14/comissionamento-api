import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyInspection, blockers, progress, RuleError } from '../src/rules.js';

const item = (over = {}) => ({ code: 'X-01', status: 'pendente', evidenceRequired: false, evidence: [], ...over });

test('aprova item simples', () => {
  const r = applyInspection(item(), { status: 'aprovado', inspector: 'Filipe' });
  assert.equal(r.status, 'aprovado');
  assert.equal(r.note, null);
});

test('reprovado exige observação', () => {
  assert.throws(() => applyInspection(item(), { status: 'reprovado', inspector: 'F' }), RuleError);
  assert.throws(() => applyInspection(item(), { status: 'reprovado', note: '   ', inspector: 'F' }), RuleError);
});

test('não aplicável exige justificativa', () => {
  assert.throws(() => applyInspection(item(), { status: 'nao_aplicavel', inspector: 'F' }), /justificativa/);
});

test('item com evidência obrigatória não é aprovado sem evidência', () => {
  assert.throws(
    () => applyInspection(item({ evidenceRequired: true }), { status: 'aprovado', inspector: 'F' }),
    /evidência/,
  );
  const ok = applyInspection(item({ evidenceRequired: true }), {
    status: 'aprovado',
    inspector: 'F',
    evidence: ['fotos/cam-01.jpg'],
  });
  assert.deepEqual(ok.evidence, ['fotos/cam-01.jpg']);
});

test('evidência de inspeção anterior continua valendo e não duplica', () => {
  const previous = item({ evidenceRequired: true, status: 'reprovado', evidence: ['a.jpg'] });
  const r = applyInspection(previous, { status: 'aprovado', inspector: 'F', evidence: ['a.jpg', 'b.jpg'] });
  assert.deepEqual(r.evidence, ['a.jpg', 'b.jpg']);
});

test('não volta para pendente', () => {
  assert.throws(() => applyInspection(item({ status: 'aprovado' }), { status: 'pendente', inspector: 'F' }), /pendente/);
});

test('exige inspetor e status válido', () => {
  assert.throws(() => applyInspection(item(), { status: 'aprovado' }), /inspector/);
  assert.throws(() => applyInspection(item(), { status: 'ok', inspector: 'F' }), /status inválido/);
});

test('evidência precisa ser lista de textos', () => {
  assert.throws(() => applyInspection(item(), { status: 'aprovado', inspector: 'F', evidence: 'foto.jpg' }), /lista/);
});

test('blockers e progress', () => {
  const items = [
    { id: 1, code: 'A', status: 'aprovado' },
    { id: 2, code: 'B', status: 'nao_aplicavel' },
    { id: 3, code: 'C', status: 'reprovado', systemLabel: 'CFTV' },
    { id: 4, code: 'D', status: 'pendente' },
  ];
  assert.deepEqual(blockers(items).map((b) => b.code), ['C', 'D']);
  assert.deepEqual(progress(items), { total: 4, pendente: 1, aprovado: 1, reprovado: 1, nao_aplicavel: 1, percent: 50 });
});
