# ADR 0031 — Set: presença e conversas do ecossistema

**Status:** aceita (29/10/2026, pedido do titular; pontos em aberto no fim)

## Contexto

O titular quer uma camada social para o ecossistema, o **Set**: como o saguão de um jogo, que junta os jogadores
qualquer que seja o "mapa" em que estão. Fase 1: **presença** (quem está online em qualquer app da Absolute ZRO e em
qual). Fase 2: **conversas**, diretas entre pessoas e por projeto. Fase 3 (salas abertas da comunidade) chega com o
lançamento do Carro do Freela e não entra agora, mas nada aqui pode impedi-la.

## Decisão

- **Mora no HUB**, como a conta: `zro.set_*` (migração `0035_set.sql`), `packages/core/src/set.ts`, API em
  `/api/v1/set/*` ([contrato](../integration-contracts/set.md)). Um Set para todos os apps; nenhum app guarda presença ou
  mensagem.
- **Quem se vê**: a **equipe** (mesma organização ativa, os dois sem ser convidado, ou o mesmo projeto com vínculo ativo)
  e os **contatos** aceitos. Contato nasce por pedido pelo @ de perfil **visível** (ADR 0029: visível por padrão; perfil
  escondido não é achado) ou de alguém que a pessoa já vê; recusa não avisa e segura novo pedido por 30 dias. Ninguém de
  fora vê presença; não há diretório.
- **Privacidade por pessoa**: Invisível (um toque; apaga a presença guardada e não grava mais), "Quem vê você online"
  (equipe e contatos, só equipe, só contatos, ninguém) e "Mostrar visto há". Bloquear esconde presença, contato e
  mensagens nos dois sentidos, sem avisar. Denunciar guarda o mínimo (motivo, detalhe de até 300, a mensagem); a
  moderação vê e resolve no console (`/admin/denuncias`, admin ou suporte).
- **Conversas**: direta só com quem trabalha junto ou é contato (a mesma resposta 403 para qualquer motivo); a do
  **projeto** é presa ao projeto canônico (`zro.projects`), vista por quem vê o projeto (`can_view_project`) na
  organização ativa, de qualquer app. Texto puro até 4000 (controle e bidi removidos), links só `http(s)`, envio
  idempotente por `chave`; editar (24 h) e apagar são marcas, com a versão anterior só para a moderação, 90 dias.
  Silenciar tira do balão; não lidas contam só de outras pessoas e sem bloqueados.
- **Banco**: RLS em toda tabela; `zro_app` só lê as próprias linhas (e grava só as próprias preferências). Tudo que é de
  outra pessoa sai por funções `security definer` com campos mínimos (id, @, nome, foto, presença); **e-mail e telefone
  nunca**. Toda escrita passa pelas funções (`zro.set_enviar`, `set_pedir_contato`…), que conferem de novo quem pode.
- **`authorize()`** na ordem do PRD §5.2 em toda operação (e-mail confirmado para pedir contato, abrir conversa e
  escrever; projeto pelo passo de projeto). Limites: 30 mensagens/min, 20 pedidos e 10 denúncias por dia, por pessoa.
  Auditoria sem conteúdo.
- **Tempo real sem serviço novo**: poll curto com **ETag** (304 sem corpo). Batida a cada 45 s com a aba visível, 3 min
  escondida, `saiu` ao fechar; estado a cada 12 s com a folha aberta; conversa aberta a cada 4 s. Online = batida ativa
  em 2 min; ausente até 6 min. SSE ou long-poll podem entrar depois atrás da mesma API, se o volume pedir.
- **Apps**: escopo de família **`zro.set`** (todo cliente com produto). O app da presença vem do **token** (produto do
  cliente OAuth) ou é a central (`hub`), nunca do navegador. O widget **`<zro-set>`** (`/set/v1/zro-set.js`, sem
  dependência, como o `<zro-ia>`) é o mesmo na central e nos apps; o app repassa `/api/zro/set/*` com o token da sessão
  no servidor. **Maestro**: pílula discreta na cápsula (ao lado do relógio) e no topo do celular, pede `zro.set` no
  login (HUB antigo recusa: `nivel=sem_set`), 401 do Set não derruba os tokens da Z.
- **Na central**: "Set" no menu lateral (grupo Trabalho, não é aba principal), a pílula na barra de cima e a página
  `/set` (lista e conversa lado a lado; uma coluna no celular). "Conversa" na página do projeto abre a do projeto.
- **Conta excluída**: saem conversas diretas, mensagens que escreveu, presença, preferências, contatos, bloqueios,
  leituras e as denúncias que fez; as denúncias contra a conta ficam para a moderação.

## Consequências

- Fase 3 (salas abertas) cabe num novo `tipo` de conversa (`sala`) com regra própria de quem vê; a API e o widget não
  mudam de forma.
- Poll custa uma consulta por pessoa a cada 45 s; o 304 corta a banda, não a consulta. Se doer, a próxima etapa é SSE
  na mesma rota.
- Quem não quer ser visto continua usando tudo: invisível não muda nada além da presença.

## Em aberto (titular)

1. Padrão de "Quem vê você online": hoje **equipe e contatos**. Manter ou nascer mais fechado?
2. Notificação fora do app (e-mail ou push de mensagem nova): não existe; só o balão dentro dos apps.
3. Anexos (imagem, vídeo, arquivo do Drive) nas conversas: fora desta fase.
4. SOBEDESCE, Synquei e os demais apps entram no Set quando cada um ganhar o repasse (`/api/zro/set/*`) e o widget.
