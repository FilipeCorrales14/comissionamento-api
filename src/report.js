// Relatório de comissionamento em Markdown. Markdown porque abre em
// qualquer lugar, converte para PDF com pandoc e fica legível no GitHub.

const LABEL = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  nao_aplicavel: 'N/A',
};

export function renderReport(project, itemsBySystem) {
  const lines = [
    `# Relatório de comissionamento: ${project.name}`,
    '',
    `- Cliente: ${project.client}`,
    project.site ? `- Local: ${project.site}` : null,
    `- Situação: ${project.status === 'concluido' ? `concluído em ${project.concluded_at.slice(0, 10)}` : 'em andamento'}`,
    `- Progresso geral: ${project.progress.percent}% (${project.progress.aprovado} aprovados, ${project.progress.nao_aplicavel} N/A, ${project.progress.reprovado} reprovados, ${project.progress.pendente} pendentes)`,
    '',
  ].filter((l) => l !== null);

  for (const system of project.systems) {
    lines.push(`## ${system.label}`, '', `Progresso: ${system.progress.percent}%`, '');
    lines.push('| Código | Item | Situação | Observação | Inspetor |');
    lines.push('| ------ | ---- | -------- | ---------- | -------- |');
    for (const item of itemsBySystem.get(system.id) ?? []) {
      lines.push(
        `| ${item.code} | ${escape(item.description)} | ${LABEL[item.status]} | ${escape(item.note ?? '')} | ${escape(item.inspector ?? '')} |`,
      );
    }
    lines.push('');
  }

  const open = project.systems.flatMap((s) =>
    (itemsBySystem.get(s.id) ?? []).filter((i) => i.status === 'reprovado').map((i) => ({ ...i, system: s.label })),
  );
  if (open.length > 0) {
    lines.push('## Pendências para correção', '');
    for (const i of open) lines.push(`- **${i.code}** (${i.system}): ${i.note}`);
    lines.push('');
  }

  return lines.join('\n');
}

function escape(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
