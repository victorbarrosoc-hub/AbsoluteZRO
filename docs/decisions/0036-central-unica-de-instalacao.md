# ADR 0036 — Central única de instalação

**Status:** aceita (01/11/2026, pedido do titular)

## Contexto

Cada app de computador (SOBEDESCE, Synquei, NOSSOM, Maestro, Relay, Carro do Freela, TPeasy) tinha o próprio botão de
instalador na página Downloads, o próprio jeito pelo Terminal e, em alguns, o próprio atualizador. A central "Absolute
ZRO" (`apps/hub-desktop`, ADR 0018) já instalava e atualizava pelo catálogo do HUB, mas o catálogo só olhava o gate de
lançamento: o plano da conta não entrava. O titular pediu que todo app de computador seja instalado e atualizado **só**
pela central, como no Adobe Creative Cloud, e que ela mostre os apps conforme o plano.

## Decisão

- **Um download só.** A página Downloads (`/baixar` e `/downloads`) oferece só a Absolute ZRO (Mac e Windows), com um
  passo a passo curto de cada sistema e a linha do Terminal (`curl … instalar.sh | bash` e `irm … instalar.ps1 | iex`,
  que baixam, conferem o SHA-256 e instalam). Os cartões dos apps dizem "Instale pela Absolute ZRO"; navegador e celular
  continuam como links. Sem texto sobre assinatura ou avisos do sistema.
- **Pela conta e pelo plano.** `GET /api/v1/desktop/meus-apps` (sessão do HUB, `authorize`): `apps` (o que a conta pode
  instalar, com versão, tamanho e SHA-256) e `bloqueados` (lançado e fora do plano, com o plano que inclui). Liberado =
  entitlement vigente do produto na organização ou **uso livre** (produto no plano grátis vigente). Gate de lançamento
  antes de tudo, canal `desktop`.
- **Lançado OU admin** (regra do titular, 01/11/2026): AEON, Revela, NOSSOM e Rift Motion só aparecem e baixam para
  admin de plataforma, que vê e instala tudo; para os outros nem bloqueados aparecem. Cartão bloqueado ("Incluso no plano
  X · Ver planos") só para app lançado.
- **Download conferido no servidor.** `/baixar/app/<id>/<arquivo>`: instalador de app pago pede a sessão (401) e o produto
  no plano (403, `authorize` com o canal `download`). O `versao.json` e os apps de uso livre seguem só com o gate, como
  antes: os apps já instalados continuam a se atualizar por essas rotas, que saíram da interface pública mas ficam no ar.
- **Plano cancelado:** o app vira bloqueado, a central não atualiza e nada é apagado do computador.
- **Atualizações só pela central (1.4.0).** A agenda confere ao abrir, a cada 4 h e em "Procurar atualizações" e avisa
  com notificação nativa ("Maestro 0.3.0 disponível"); atualizar um ou todos, com progresso e SHA-256. "Atualizar
  sozinho" por app nos Ajustes (`/app/ajustes`), padrão desligado.
- **Deep link** `absolutezro://apps/<id>?acao=atualizar|instalar`: abre a central no cartão do app e oferece a ação; só a
  pessoa confirma. Contrato em `apps/hub-desktop/README.md`.
- **Login:** a central é o HUB numa janela; a sessão é o cookie `httpOnly` da partição do app (cifrado pelo Chromium com
  a chave do sistema). Nada de OIDC próprio: a conta é a mesma, e a página nunca lê a sessão.

## Consequências

- Um app novo entra pela lista `APPS_DESKTOP` (id, Release com nomes `<Nome>-<versão>-b<build>-…`, padrão dos arquivos),
  gate (`desktop` e `download`) e plano. O Rift Motion já tem a entrada e aparece quando houver produto, Release, gate e
  plano. O AEON entra quando o Release dele seguir os nomes com versão.
- A central 1.3 continua funcionando (lê `/api/v1/desktop/apps`, que agora também esconde os não lançados de quem não é
  admin; o download confere o plano).
- Os apps dos produtos deixam de se atualizar sozinhos e passam a abrir o deep link (lado dos produtos, outro trabalho).

## Reversão

Sem migração. Voltar os botões por app é reverter `lib/downloads.ts` e `components/download-*.tsx`; o padrão "Atualizar
sozinho" ligado é trocar `atualizarSozinho` na central (`desktop/main.cjs`).
