// Regras de inspeção de um item. Ficam isoladas aqui, sem banco nem HTTP,
// porque são o coração do sistema e as mais sujeitas a mudar.

export const STATUSES = ['pendente', 'aprovado', 'reprovado', 'nao_aplicavel'];
export const CLOSED = new Set(['aprovado', 'nao_aplicavel']);

export class RuleError extends Error {}

export function applyInspection(item, change) {
  const { status, note, evidence, inspector } = change;

  if (!STATUSES.includes(status)) {
    throw new RuleError(`status inválido. Use: ${STATUSES.join(', ')}`);
  }
  if (!inspector || !String(inspector).trim()) {
    throw new RuleError('informe quem fez a inspeção ("inspector")');
  }

  const cleanNote = note?.trim() || null;
  const nextEvidence = mergeEvidence(item.evidence, evidence);

  if (status === 'reprovado' && !cleanNote) {
    throw new RuleError('item reprovado precisa de observação descrevendo o problema');
  }
  if (status === 'nao_aplicavel' && !cleanNote) {
    throw new RuleError('marcar como não aplicável exige justificativa');
  }
  if (status === 'aprovado' && item.evidenceRequired && nextEvidence.length === 0) {
    throw new RuleError(`o item ${item.code} só pode ser aprovado com evidência (foto, relatório, medição)`);
  }
  if (status === 'pendente' && item.status !== 'pendente') {
    throw new RuleError('um item inspecionado não volta para pendente; registre nova inspeção');
  }

  return {
    status,
    note: cleanNote,
    evidence: nextEvidence,
    inspector: String(inspector).trim(),
  };
}

// Evidências se acumulam entre inspeções: a foto da primeira visita
// continua valendo como histórico mesmo depois da correção.
function mergeEvidence(current = [], added) {
  if (added === undefined) return current;
  if (!Array.isArray(added) || added.some((e) => typeof e !== 'string' || !e.trim())) {
    throw new RuleError('"evidence" deve ser uma lista de textos (URL ou nome de arquivo)');
  }
  return [...new Set([...current, ...added.map((e) => e.trim())])];
}

export function blockers(items) {
  return items
    .filter((i) => !CLOSED.has(i.status))
    .map((i) => ({ id: i.id, code: i.code, status: i.status, system: i.systemLabel }));
}

export function progress(items) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const i of items) counts[i.status]++;
  const done = counts.aprovado + counts.nao_aplicavel;
  return {
    total: items.length,
    ...counts,
    percent: items.length === 0 ? 0 : Math.round((done / items.length) * 100),
  };
}
