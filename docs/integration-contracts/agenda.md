# Agenda pelas Conexões (`zro.agenda`)

Contrato da API que os apps da família usam para ler e escrever no Google Agenda da pessoa **pelo HUB** (ADR 0026). A
pessoa conecta o Google Agenda uma vez em `https://absolutezro.com/conexoes`; nenhum app pede OAuth ao Google por
conta própria nem guarda token do Google.

Primeiro app: Maestro (fase 1). Z, "Hoje" do HUB e Carro do Freela entram depois com o mesmo contrato.

## Autenticação

- `Authorization: Bearer <access token do login único>` do app, com o escopo **`zro.agenda`** (escopo de família: todo
  cliente com produto pode pedir, migration `0026`). Sessão do navegador do HUB não vale aqui (403 `action_not_allowed`,
  `details.erro = so_app`).
- O app é o produto do cliente OAuth do token. Nada do corpo identifica pessoa, organização ou app.
- Ordem do PRD §5.2: token válido → organização do token → vínculo ativo → gate de lançamento do app (canal `api`) →
  limite → recurso externo (a conexão Google da pessoa existe, está ativa e o app está ligado nela).

## Erros

| Status | `error`                | Quando                                                                                                   |
| ------ | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| 401    | `unauthenticated`      | Token inválido, vencido, sem o escopo ou acesso do app removido no Perfil.                               |
| 403    | `product_closed`       | O app está fechado para a pessoa (ADR 0023).                                                             |
| 403    | `action_not_allowed`   | Sem token de app (`so_app`) ou `{app}` do caminho diferente do app do token (`outro_app`).               |
| 403    | `app_desligado`        | A pessoa desligou este app em Conexões. `details.conectar` leva à página.                                |
| 409    | `sem_conexao`          | Sem Google Agenda (`details.motivo = nenhuma`) ou o Google pediu para conectar de novo (`reconectar`).   |
| 409    | `conflict`             | Já existe no Google um evento com o id deste (app, ref) que não é deste app.                             |
| 422    | `invalid_input`        | Janela, datas, ref ou corpo fora do formato.                                                             |
| 429    | `rate_limited`         | Limite por pessoa e app (leitura 120/10 min, escrita 300/10 min) ou o Google pediu pausa.                |
| 503    | `upstream_unavailable` | O Google não respondeu, ou as Conexões estão sem configuração (`GOOGLE_CLIENT_*` ou `ZRO_CONEXOES_KEY`). |

Com 409 `sem_conexao` e 403 `app_desligado`, o app mostra o estado e um botão para `details.conectar`. O app nunca
repete sozinho em laço: tenta de novo quando a pessoa voltar.

## Rotas

### `GET /api/v1/agenda/conexao`

Estado para a tela do app. Sem conexão também é 200.

```json
{
  "conectada": true,
  "estado": "ativa",
  "conta_email": "pessoa@gmail.com",
  "app_ligado": true,
  "calendarios": 2,
  "conectar": "https://absolutezro.com/conexoes"
}
```

### `GET /api/v1/agenda/livre-ocupado?de=<RFC3339>&ate=<RFC3339>[&incluir_proprios=1]`

Intervalos ocupados (junção) nas agendas que a pessoa escolheu, até 62 dias. Calculado pelos eventos (o escopo
`calendar.events` lê eventos; o `freeBusy` do Google pediria outro escopo): não contam eventos transparentes ("livre"),
cancelados ou recusados pela pessoa. Por padrão saem os eventos criados pelo próprio app (ele já os conhece).

```json
{ "de": "…Z", "ate": "…Z", "ocupado": [{ "inicio": "2026-12-01T12:00:00.000Z", "fim": "2026-12-01T14:00:00.000Z" }], "calendarios": 2, "incompleta": false }
```

`incompleta = true`: alguma agenda escolhida sumiu ou deixou de ser compartilhada.

### `GET /api/v1/agenda/eventos?de=<RFC3339>&ate=<RFC3339>`

Eventos com campos mínimos (sem descrição, convidados, anexos ou link de reunião), até 500.

```json
{
  "eventos": [
    {
      "id": "…",
      "calendario": "primary",
      "titulo": "Reunião",
      "inicio": "2026-12-01T12:00:00.000Z",
      "fim": "…",
      "dia_inteiro": false,
      "ocupa": true,
      "app": null,
      "ref": null
    }
  ],
  "incompleta": false
}
```

Dia inteiro: `inicio`/`fim` são datas (`fim` exclusivo, como no Google). `app` é o app da família que criou o evento;
`ref` só volta para o próprio app.

### `PUT /api/v1/agenda/eventos/{app}/{ref}`

Grava (cria ou substitui) o evento do app na agenda principal da pessoa. Idempotente: o mesmo `(app, ref)` é sempre o
mesmo evento. `{app}` tem de ser o app do token; `ref` é o id do item no app (`^[A-Za-z0-9._:-]{1,120}$`).

```json
{
  "titulo": "Diária: Campanha verão",
  "inicio": "2026-11-03T08:00:00-03:00",
  "fim": "2026-11-03T18:00:00-03:00",
  "local": "Estúdio 2",
  "descricao": "Projeto: …\nEquipe: …",
  "fuso": "America/Sao_Paulo",
  "ocupa": true,
  "link": "https://maestro.absolutezro.com/app/agenda/…"
}
```

Dia inteiro: `{ "titulo": "Prazo: Reels", "dia": "2026-11-05", "ate_dia": "2026-11-05", "ocupa": false }` (`ate_dia`
inclusivo). Até 31 dias por evento. Resposta 201 `{ id, criado: true, link }` ou 200 `{ id, criado: false, link }`.

Como o HUB garante a posse e a idempotência: o evento leva `extendedProperties.private = { zro_app, zro_ref }` e o id no
Google é `sha256(pessoa:app:ref)` (32 hex). O HUB procura pelo id e, se não achar, por `privateExtendedProperty`; só
atualiza o que tem a marca do app. Dois PUT ao mesmo tempo não duplicam (o segundo recebe 409 do Google e atualiza o
mesmo id). Gravar de novo um evento apagado traz ele de volta.

### `DELETE /api/v1/agenda/eventos/{app}/{ref}`

Apaga o evento do app. 204 sempre (já não existia também é 204).

## Auditoria e privacidade

Toda chamada fica em `zro.audit_logs` (`agenda.livre_ocupado`, `agenda.eventos`, `agenda.evento.gravado`,
`agenda.evento.apagado`) só com app, ref, tamanho da janela e contagens: nunca título, local, descrição ou horário. A
conexão em si: `conexao.ligada`, `conexao.agendas`, `conexao.app`, `conexao.reconectar`, `conexao.desligada`.

Tokens do Google: cifrados (AES-256-GCM, chave por HKDF de `ZRO_CONEXOES_KEY`), renovados no servidor com a linha
travada. `invalid_grant` apaga os tokens e marca `reconectar`. Desconectar revoga no Google e apaga a linha.
