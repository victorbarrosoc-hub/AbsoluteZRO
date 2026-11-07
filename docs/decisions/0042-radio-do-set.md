# ADR 0042 — Rádio do set: voz por botão (push-to-talk) para a equipe da diária

**Status:** aceita (05/11/2026, pedido do titular). **Nome: RADION — Stay connected.** (06/11/2026), em
`radion.absolutezro.com` (ADR 0025; ver a revisão de 06/11/2026). Nasce **fechado** no gate (`zro.product_release`,
ADR 0023): não aparece para ninguém além do papel `admin` até o titular lançar.

**Fase 1 feita (05/11/2026), sem integração** (pedido do titular: "faz sem interação com as outras plataformas ainda,
pra eu testar"): `products/radio/` (id técnico provisório `radio`), com diária por código e QR, canais Geral e Equipe,
segurar para falar, avisos de set, tela de cue, login único e gate. Voz de aparelho para aparelho em malha (WebRTC), sem
servidor de mídia; o servidor só leva os sinais de conexão. Sem deploy: o catálogo do HUB, o cliente OIDC, o schema no
Supabase e o projeto Vercel pedem autorização. Detalhes em `products/radio/README.md`.

## Contexto

O titular quer um app de walkie-talkie (push-to-talk, PTT) para a equipe de set, no celular. Pesquisa (05/11/2026):

| Tipo                        | Exemplos                           | O que falta para o set brasileiro                                                                                                     |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| PTT genérico                | Zello, Buz                         | Não sabe nada de set (diária, função, cena, take). Zello Work: cerca de US$ 79,99/mês                                                 |
| Intercom de broadcast       | Unity Intercom, Clear-Com Agent-IC | Depende de servidor próprio ou de matriz Clear-Com; é coisa de TV e evento grande                                                     |
| Feito para set              | CrewCast, Crew Comms               | Só iPhone; CrewCast pede iOS 26 e cobra em dólar (US$ 17,99 a 49,99/mês ou passe diário); Crew Comms só em Wi-Fi local, até 8 pessoas |
| Em português, para o Brasil | nenhum encontrado                  | —                                                                                                                                     |

O CrewCast mostra o que o set valoriza além da voz: canais por departamento, avisos globais ("Silêncio", "Ação",
"Corta"), tela preta de cue para o elenco e entrada por QR na ordem do dia.

Limite técnico que decide o desenho:

- **No iPhone, voz com a tela bloqueada só em app nativo.** O framework PushToTalk da Apple (iOS 16+) pede app
  nativo, push próprio pelo APNs e servidor de áudio nosso. Uma página web (PWA) só fala e ouve **com o app aberto e
  a tela ligada**.
- **Fora da App Store, no Brasil:** desde junho de 2026 (acordo da Apple com o CADE, iOS 26.5) dá para distribuir por
  lojas alternativas, mas a Apple ainda autentica o app e a conta de desenvolvedor continua obrigatória. No Android, o
  APK instala direto por link. O TestFlight serve para beta fechado.
- **Locação sem sinal:** rádio de verdade não depende de rede; celular depende. O app **complementa** o rádio em set
  grande e **substitui** em equipe pequena (conteúdo, publicidade, institucional), que é o público do ecossistema.

## Decisão proposta

### O que é

O setor que **fala no set**: canais de voz por botão, avisos de set e a tela de cue, para a equipe de uma diária. O que
não é dele: conversa por texto (Set, ADR 0032), escala e pagamento (Maestro), roteiro e plano (TPeasy), cópia e backup
(SOBEDESCE).

### Diferencial: ninguém monta a equipe no app

- **Canais nascem da escala do Maestro** (`escalas`: freela × função × período da diária). Fechou a diária, cada pessoa
  cai no canal geral e no da função dela (Câmera, Som, Luz, Produção, Direção). Uma conta Absolute ZRO, sem cadastro.
  Quem não está na escala entra por QR ou link da ordem do dia, como convidado da diária.
- **Avisos de set** (Silêncio, Ação, Corta, Intervalo) para todos de uma vez, com som curto e vibração. Só quem tem o
  papel de assistente de direção (ou quem a produção marcar) dispara.
- **Tela de cue** para o elenco: preta, sem brilho, mostra o aviso grande.
- **Integrações** (cada uma com contrato próprio em `docs/integration-contracts/` antes de existir):
  - TPeasy: a lista do dia (cena, plano) aparece junto com o aviso de Ação.
  - SOBEDESCE: "cartão copiado e conferido" (com o MD5, a regra dele) vira aviso no canal do DIT ou da produção.
  - Synquei: o horário de cada Ação e Corta vira marca para ajudar a sincronizar. **Só depois de testar com material
    real**; até lá não aparece como recurso.
  - Set: o texto continua na conversa do projeto (ADR 0032); o rádio só tem voz e avisos.

### Arquitetura

- **Mora em `products/<app>/`** (ADR 0013), schema e papel próprios no Supabase `AbsoluteZRO`, login único (OIDC do HUB,
  ADR 0012), `authorize()` em toda operação e RLS em toda tabela, com teste de isolamento.
- **Áudio em tempo real por WebRTC com um servidor de mídia (SFU).** O poll do Set não serve para voz. Candidato:
  LiveKit (código aberto; dá para hospedar ou usar o serviço deles). O servidor de mídia é **serviço novo e pago**:
  provedor, custo e conta pedem autorização do titular.
- **Fase 1, web (PWA):** canais, PTT com o app aberto, avisos, tela de cue, QR. Valida o uso sem loja e sem custo de
  conta Apple. A tela diz com clareza que, no iPhone, o rádio precisa do app aberto (nada de prometer o que não faz).
- **Fase 2, nativo:** o mesmo código embrulhado num app iOS com PushToTalk (TestFlight, depois loja) e Android com
  serviço em primeiro plano (APK por link, depois Play Store). Só entra se a fase 1 provar uso.

### Voz e privacidade

- **Sem gravação por padrão.** A voz passa e some. Histórico de voz, se um dia entrar, é opção da produção por diária,
  com aviso a todos, prazo de retenção curto e consentimento (voz é dado pessoal, LGPD).
- O repositório é público: nenhum áudio de teste versionado; testes usam tom sintético.
- Avisos e entrada nos canais ficam na auditoria sem conteúdo de voz.

### Planos

Entra no catálogo de níveis da ADR 0039 como app próprio, com limite por nível (pessoas por diária, diárias por mês)
via `consumeQuota` com chave de idempotência. Preço e nível pedem o titular.

## Ordem

1. Nome, marca e ícone (titular). Pasta `products/<app>/`, gate fechado (migration nova), página neutra no domínio.
2. Fase 1 em teste com uma produtora parceira, numa diária de verdade.
3. Integrações: escala do Maestro → canais; SOBEDESCE → aviso do DIT; TPeasy → lista do dia.
4. Fase 2 (nativo) só com o uso medido na fase 1.

## Consequências

- Primeiro app do ecossistema com áudio ao vivo e, na fase 2, o primeiro nativo de celular: novo serviço (SFU), novo
  custo por minuto de voz e conta de desenvolvedor Apple e Google.
- A escala do Maestro ganha mais um uso; o Maestro continua funcionando sem o rádio, e o rádio funciona sem o Maestro
  (equipe por QR).

## Em aberto (titular)

- ~~Nome~~: **RADION — Stay connected.** (06/11/2026). Falta a conferência no INPI.
- Servidor de mídia: hospedado por nós ou serviço pago; orçamento por minuto.
- Se o rádio é vendido sozinho, só junto do Maestro ou nos dois.
- Gravação de voz: nunca ou opcional por diária.

## Como reverter

Enquanto for proposta, basta apagar esta ADR. Depois da pasta e do gate, o produto sai do catálogo com migration nova
(nunca editando uma aplicada) e o domínio volta para a página neutra.

## Revisão (05/11/2026): o rádio mora no HUB

O titular decidiu "usar o do ecossistema": em vez de um site próprio com login e banco separados (que pediam um segredo
de cliente e uma senha de banco novos), o rádio abre em **absolutezro.com/radio**, com a conta e a conexão do HUB.

- As regras ficam num núcleo só, `products/radio/api/_nucleo.js`, usado pelo app separado (modo local e testes) e pelo
  HUB, que serve uma cópia gerada (`apps/hub-web/lib/radio/`, `node products/radio/scripts/para-o-hub.mjs`; o teste
  `tests/integration/radio.test.ts` confere byte a byte).
- Página, estilo e scripts saem por `/radio` e `/radio/app/*`, e a API por `/api/v1/radio/*`, só para quem passa no
  gate (`authorize` com o lançamento de `radio`, canal web). Fora dele, 404, com ou sem sessão. Nada do rádio em
  `public/`.
- Os dados continuam no schema `radio` (dono: papel `radio`). O HUB só assume o papel `radio_app` em cada operação
  (migração `0059`), e o RLS vale sempre.
- O projeto Vercel `radio` (radio.absolutezro.com; hoje `radion`) fica parado na página neutra; sai quando o titular decidir.

## Revisão (06/11/2026): RADION, papéis e poderes, app próprio

O titular deu o nome (**RADION — Stay connected.**), aprovou a marca (o leque: seis lâminas girando no mesmo rebite, nas
cores dos setores; `products/radio/scripts/marca.mjs` é a única fonte da geometria), as telas e as fases.

- **Endereço:** `radion.absolutezro.com` (ADR 0025, autorizado pelo titular), no projeto Vercel `radion` (Root Directory
  `products/radio`), com o login único (cliente `radio-web`, escopo `zro.set`) e o Set (`/api/zro/set`, repasse como no
  Relay). `absolutezro.com/radio` continua servindo a mesma versão até o domínio ligar. HUB `0061`: nome, endereço e os
  canais `sso` e `api` para quem está na lista de acesso.
- **Papéis por diária:** dono (pode tudo), responsável (um por setor, escolhido pelo dono: silencia, reativa e tira
  gente do setor dele, silencia o setor, manda aviso para o setor, fala no Geral), equipe (fala no próprio setor e ouve
  o Geral) e convidado (só ouve). Ninguém silencia o dono nem a Direção.
- **Silêncio:** uma pessoa (5 min, 15 min ou até reativar), o setor ou o set inteiro; no Gravando, só a Direção e o Som
  falam até o Corta (ajuste do dono); quem foi silenciado vê quem foi e pede a palavra; "silenciar só para mim" fica no
  aparelho. Histórico de quem silenciou quem, só para o dono; a voz nunca.
- **Onde vale:** as regras de poder moram no banco (`radio.moderar`, `radio.avisar`, `radio.silenciados`,
  `db/migrations/0001_poderes.sql`); o `radio_app` não escreve silêncio, mão, histórico, papel nem setor. Como a voz vai
  de aparelho para aparelho, quem impõe o silêncio é o aparelho: o servidor diz quem está silenciado, o aparelho dele
  fecha o microfone e os outros não tocam a voz dele. Um aparelho adulterado poderia furar; fechar isso de vez pede o
  servidor de mídia (em aberto, com custo).
- **Página inicial** (`app/site.html`, telas de verdade de `scripts/telas-do-site.mjs`): enquanto não lança, só a prévia
  em `/sobre` para quem tem acesso; quem não entrou vê a página neutra. No lançamento, `RADION_SITE_ABERTO=1` junto com a
  migration que abre o gate.
- **Fases:** 2) diária ligada ao projeto do HUB e convite pelo @; 3) agenda do Maestro e escala do Carro do Freela
  (contrato em `docs/integration-contracts/` antes do código).

## Fontes da pesquisa (05/11/2026)

- [CrewCast na App Store](https://apps.apple.com/us/app/crewcast/id6747609699)
- [Crew Comms na App Store](https://apps.apple.com/br/app/crew-comms/id6755058643)
- [Zello para trabalho](https://zello.com/lp/walkie-talkie-radios-for-work/)
- [Clear-Com Agent-IC](https://clearcom.com/Products/Details/agent-ic-intercom-mobile-app)
- [Unity Intercom](https://apps.apple.com/lb/app/unity-intercom/id897632774?l=ar)
- [Apple PushToTalk, WWDC22](https://developer.apple.com/videos/play/wwdc2022-10117)
- [Apple: mudanças no iOS no Brasil](https://www.apple.com/br/newsroom/2026/06/apple-announces-changes-to-ios-in-brazil/)
