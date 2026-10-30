# Pessoas: perfil profissional com @ (`zro.pessoas`)

Contrato da API que os apps da família usam para achar pessoas do ecossistema audiovisual pelo @ ou pelo nome e
convidá-las para a organização (ADR 0029, migração `0029`). Toda conta Absolute ZRO é um perfil: @ único, nome, foto,
funções, cidade, portfólio (opcional), bio curta (opcional) e selos dos apps que a pessoa usa e ligou.

Primeiro app: Maestro (Ajustes › Pessoas e Freelas). Carro do Freela lê o @ pelo login único (`preferred_username`).

## Privacidade (regras que não mudam)

- O perfil aparece na busca **por padrão** (decisão do titular, 29/10/2026). A pessoa desliga em
  `absolutezro.com/perfil/profissional` ("Aparecer na busca"); quem já tinha conta recebeu um aviso único com o botão
  de esconder.
- **E-mail e telefone nunca saem.** Nenhuma resposta desta API traz e-mail, telefone, organização ou papel de alguém. O
  perfil recusa e-mail e telefone na bio, na cidade e em "Outra".
- Perfil escondido não aparece na busca e o @ dele responde 404, igual a um @ que não existe. Para convidar alguém
  escondido, só o convite pelo e-mail exato, na central (Equipe › Convidar).
- O convite por @ nunca devolve o e-mail da pessoa: o HUB manda o aviso direto a ela e o convite aparece em Equipe ›
  Convites para você. A pessoa sempre aceita antes de entrar.
- Auditoria: a busca pelos apps grava o app e quantos resultados (`perfil.busca`), **nunca o texto buscado**.
- **A comunidade** (`GET /api/v1/pessoas`, migração `0037`, decisão do titular de 30/10/2026): a lista que um app mostra
  (o Carro do Freela é a comunidade do audiovisual). Só entra quem aparece na busca **e já confirmou o @** (escolheu no
  cadastro ou trocou depois; a sugestão automática não conta) e tem conta ativa. Filtro opcional `funcao` (chave),
  ordem pelo @, até 200 por página com `proximo` como cursor. A própria pessoa vem junto se estiver visível. Limite: 120
  páginas a cada 10 minutos por pessoa; auditoria `perfil.comunidade` com o app e quantos vieram.

## Autenticação e ordem de checagem

- `Authorization: Bearer <access token do login único>` do app, com o escopo **`zro.pessoas`** (escopo de família: todo
  cliente com produto pode pedir; migração `0029`). Sessão do navegador do HUB não vale (403 `action_not_allowed`,
  `details.erro = so_app`).
- Ordem do PRD §5.2 (`authorize()`): token válido → e-mail confirmado → organização do token → vínculo ativo → (convite:
  papel dono ou administração) → limite.
- Limites: 60 buscas e leituras de @ a cada 10 minutos por pessoa (contadas junto com a central); 30 convites por @ por
  hora por organização.

## O @

- 3 a 30 caracteres: `a-z`, `0-9`, `.` e `_`; sem ponto no começo, no fim ou dobrado; pelo menos uma letra.
- Único sem diferença de maiúsculas (é sempre guardado em minúsculas). Palavras reservadas (marca, apps, suporte…)
  recusadas, também com ponto ou sublinhado no meio. Regras em `packages/auth/src/arroba.ts`, iguais às do banco.
- Escolhido no cadastro; quem já tinha conta ganhou uma sugestão a partir do nome e pode trocar. Trocas: 2 a cada 30
  dias (sair da sugestão não conta). O @ antigo leva ao perfil por 90 dias e, nesse tempo, ninguém mais pega.
- No login único: claim padrão **`preferred_username`** (escopo `profile`), sem o "@", no `id_token` e no `userinfo`.

## Objeto `pessoa`

```json
{
  "id": "uuid (o sub do login único)",
  "arroba": "carla.drone",
  "nome": "Carla Lima",
  "foto": "https://absolutezro.com/api/v1/foto/<id público> | null",
  "funcoes": [
    { "chave": "camera", "nome": "Câmera" },
    { "chave": "outra", "nome": "Steadicam" }
  ],
  "cidade": "Natal | null",
  "portfolio": "https://… | null",
  "bio": "até 280 caracteres | null",
  "selos": [{ "produto": "carro-do-freela", "texto": "Freela no Carro do Freela" }],
  "perfil": "https://absolutezro.com/pessoas/@carla.drone"
}
```

Funções (lista fixa): `direcao` Direção, `producao` Produção, `camera` Câmera, `edicao` Edição, `color` Color, `som`
Som, `drone` Drone, `fotografia` Fotografia, `motion` Motion, `roteiro` Roteiro e `outra` (o `nome` é o texto livre).
Selo só aparece quando a pessoa ligou **e** já usa o app (tem conta nele pelo login único).

## Rotas

### `GET /api/v1/pessoas/busca?q=&limite=`

`q` começando com `@` busca pelo começo do @; sem `@`, pelo começo do @ ou por qualquer parte do nome (sem acento). Menos
de 2 caracteres devolve lista vazia. `limite` 1–20 (padrão 12). Sem a própria pessoa.

`200 { "pessoas": [pessoa] }`

### `GET /api/v1/pessoas/@{arroba}`

`200 { "pessoa": pessoa, "antiga": false }` — `antiga: true` quando o @ pedido é um antigo (o app pode trocar o @
guardado pelo `pessoa.arroba`). Escondido ou inexistente: 404 `not_found`.

### `POST /api/v1/pessoas/convites`

Corpo `{ "arroba": "@carla.drone", "papel": "editor" }` (`papel`: `admin` só pelo dono, `manager`, `editor`, `viewer`,
`billing`; padrão `editor`). Convite para a organização do token, 7 dias.

`201 { "convite": { "id", "arroba", "papel", "aviso": "email" | "central" } }` — `central` quando o e-mail não saiu
(a pessoa vê o convite em Equipe › Convites para você).

## Erros

| Status | `error`                  | Quando                                                                               |
| ------ | ------------------------ | ------------------------------------------------------------------------------------ |
| 401    | `unauthenticated`        | Token inválido, vencido, sem o escopo ou acesso do app removido no Perfil.           |
| 403    | `action_not_allowed`     | Sem token de app (`so_app`).                                                         |
| 403    | `email_not_verified`     | A pessoa do token ainda não confirmou o e-mail.                                      |
| 403    | `forbidden_role`         | Convite por quem não é dono nem administração, ou administrador convidado por admin. |
| 403    | `product_closed`         | O app está fechado para a pessoa (ADR 0023).                                         |
| 404    | `not_found`              | @ inexistente ou escondido (a mesma resposta).                                       |
| 409    | `conflict`               | A pessoa já está na equipe ou já tem convite aberto.                                 |
| 409    | `no_active_organization` | Token sem organização (o app não pediu o escopo `org`).                              |
| 422    | `invalid_input`          | Papel fora da lista ou corpo fora do formato.                                        |
| 429    | `rate_limited`           | Limite de buscas ou de convites.                                                     |
