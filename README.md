# Comissionamento API

API para conduzir o comissionamento de sistemas de segurança eletrônica e incêndio: CFTV, controle de acesso e detecção e alarme de incêndio. Cada sistema instalado recebe um checklist, cada item é inspecionado em campo, e o projeto só pode ser encerrado quando não sobra nada pendente ou reprovado.

No comissionamento real, o checklist costuma viver numa planilha que cada técnico preenche de um jeito, sem histórico e sem garantia de que um item crítico não foi aprovado "de boca". Esta API transforma as regras dessa etapa em código.

## Regras implementadas

- Item **reprovado** precisa de observação descrevendo o problema.
- Item **não aplicável** precisa de justificativa.
- Itens marcados no modelo como críticos (ex.: teste de 100% dos detectores) só são **aprovados com evidência**: foto, relatório ou medição.
- Toda inspeção fica registrada no **histórico** do item: quem inspecionou, quando, com que resultado. Um item reprovado e depois corrigido mostra as duas inspeções.
- O projeto só é **concluído** sem itens pendentes ou reprovados. Se houver, a API devolve `409` com a lista do que está bloqueando.
- Depois de concluído, o projeto fica **somente leitura**.

As regras estão em `src/rules.js`, sem dependência de banco ou HTTP, e são testadas isoladamente.

## Modelos de checklist

Ficam em `templates/*.json`, um arquivo por tipo de sistema. Criar um modelo novo (sonorização de emergência, automação predial) é escrever um JSON, sem mexer no código:

```json
{
  "key": "cftv",
  "name": "CFTV",
  "sections": [
    {
      "name": "Testes",
      "items": [
        { "code": "CFTV-09", "description": "Imagem diurna e noturna (IR) validada em cada câmera", "evidence": true }
      ]
    }
  ]
}
```

Os modelos são carregados e validados na inicialização: código repetido ou campo faltando impede a API de subir.

## Como rodar

Node.js 22.13 ou superior, sem dependências.

```bash
npm start
```

## Exemplo de uso

```bash
# projeto e sistema
curl -X POST localhost:3000/projects -H 'content-type: application/json' \
  -d '{"name": "Hospital - Ala Norte", "client": "Hospital Exemplo", "site": "Porto Alegre/RS"}'

curl -X POST localhost:3000/projects/1/systems -H 'content-type: application/json' \
  -d '{"template": "controle-acesso", "label": "Acesso - Ala Norte"}'

# itens do checklist (opcional: ?status=pendente)
curl localhost:3000/systems/1/items

# inspeção de um item
curl -X PATCH localhost:3000/items/5 -H 'content-type: application/json' \
  -d '{"status": "reprovado", "note": "Porta da escada não libera com alarme de incêndio", "inspector": "Filipe"}'

curl localhost:3000/items/5/history
curl -X POST localhost:3000/projects/1/conclude
curl localhost:3000/projects/1/report      # relatório em Markdown
```

Tentativa de concluir com pendência:

```json
{
  "error": "1 item(ns) impedem a conclusão",
  "blockers": [{ "id": 5, "code": "CA-05", "status": "reprovado", "system": "Acesso - Ala Norte" }]
}
```

Veja um relatório gerado em [`exemplos/relatorio.md`](exemplos/relatorio.md).

## Endpoints

| Método | Rota                        | Descrição                                   |
| ------ | --------------------------- | ------------------------------------------- |
| GET    | `/templates`                | modelos de checklist disponíveis            |
| GET    | `/projects`                 | projetos com percentual de avanço           |
| POST   | `/projects`                 | cria projeto (`name`, `client`, `site`)     |
| GET    | `/projects/:id`             | projeto, sistemas e avanço de cada um       |
| POST   | `/projects/:id/systems`     | adiciona sistema a partir de um modelo      |
| POST   | `/projects/:id/conclude`    | encerra o projeto, se não houver bloqueios  |
| GET    | `/projects/:id/report`      | relatório em Markdown                       |
| GET    | `/systems/:id/items`        | itens do checklist                          |
| PATCH  | `/items/:id`                | registra inspeção                           |
| GET    | `/items/:id/history`        | histórico de inspeções do item              |

Códigos de erro: `400` entrada inválida, `404` não encontrado, `409` conflito de estado (projeto concluído, pendências), `422` regra de inspeção violada.

## Decisões

- **Checklist copiado para o projeto.** Ao adicionar um sistema, os itens do modelo são copiados. Se o modelo mudar depois, projetos antigos não são afetados, o que é o comportamento esperado para um documento de entrega.
- **Evidência como referência textual.** A API guarda o caminho ou URL da foto, não o arquivo. Upload e armazenamento ficam para uma etapa seguinte (ex.: S3 ou disco local).
- **Erros de domínio separados de erros HTTP.** O serviço lança `NotFound`, `Conflict` e `RuleError`, e só a camada da API traduz para status HTTP.

## Testes

```bash
npm test
```

O teste de API percorre o fluxo inteiro: cria projeto, inspeciona os itens, tenta concluir com pendência, corrige, conclui e confirma que nada mais pode ser alterado.

## Próximos passos

- Upload de fotos com miniatura no relatório.
- Assinatura do responsável técnico na conclusão.
- Exportação do relatório em PDF.
- Autenticação, com perfis de técnico e de engenheiro responsável.

## Licença

MIT
