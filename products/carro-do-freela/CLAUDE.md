# Carro do Freela — contexto para retomar o trabalho

Protótipo de **agenda e contratação de freelas do audiovisual**, mercado de
Natal/RN. Dono do produto: **Victor Barroso** (`victorbarrosoc@gmail.com`), que
trabalha no set — as decisões de produto são dele e costumam vir de experiência
direta do mercado, não de teoria. Quando ele contraria uma sugestão técnica,
normalmente é porque conhece um detalhe do mercado que não está no código.

O nome vem do grupo de WhatsApp: *"olha o carro do freela passando"*.

---

## ⚠️ Restrições que não podem ser quebradas

⚠️ **A LISTA REAL NÃO EXISTE MAIS, e isso é ponto final, não pendência**
(13/set). Ela vivia só em `src/crew.local.json`, fora do git por decisão de
desenho; o container foi reciclado levando o diretório inteiro. Varri os **63
commits desta árvore**: `src/crew.json` tem UM ÚNICO conteúdo em toda a
história, sempre o fictício — o dado real nunca chegou ao repositório. **A
regra funcionou exatamente como projetada, e o custo dela é este.** Sempre
foram as duas faces da mesma moeda.

Victor, decidindo: *"não quero a lista original com os nomes da planilha, era
só pra eu visualizar a plataforma com nomes reais. Pode deixar os fictícios e
quando for lançar não vai ter nenhum nome inscrito, pq as pessoas vão começar
a se cadastrar do zero."*

Isso **confirma o PRD em vez de contrariá-lo**: os 109 sempre foram lista de
CONVOCAÇÃO, não contas pré-criadas. O `crew.local.json` era conveniência de
protótipo — ver as telas com nomes de verdade —, nunca peça do produto. **Não
o reconstrua** sem o Victor pedir: refazer um arquivo com 109 nomes reais para
"poder testar" é criar de novo o problema que a regra evitava.

O que sobra em vigor abaixo continua valendo inteiro; só a palavra "cofre"
mudou de significado — hoje ela descreve um lugar que está vazio de propósito.

1. **Telefone nunca é versionado nem exibido.** Não está no `crew.json` e não
   pode entrar. ⚠️ **Esta não depende da lista real para ser conferida**, e
   desde 13/set `sem-nome-real.js` a confere sempre, por forma (campo com nome
   de telefone, ou sequência com jeito de número brasileiro).
2. **Não invente diária de ninguém.** Quem não publicou tabela aparece com a
   *faixa de referência da praça* (média de mercado por função), nunca um valor
   atribuído a uma pessoa específica.
3. **Não atribua defeito nem trabalho a pessoa real.** No brechó, os itens com
   defeito declarado são os anúncios do próprio Victor; os demais ficam em bom
   estado. Trabalhos de portfólio só existem no perfil de demonstração.
4. **`npm run build:anon`** gera a versão com nomes reduzidos ("Ana S.") e sem
   link de portfólio, para quando o link for público.
5. `vercel.json` manda `X-Robots-Tag: noindex, nofollow`. Isso reduz exposição,
   **não** torna o link privado.
6. ~~Banners de demonstração visíveis nas telas que mostram dado simulado.~~
   **Mudou em 17/out · 5, por decisão do Victor** (*"tira as mensagens de
   protótipo … isso tudo é cara de protótipo"*): **a prévia se declara num
   lugar só** — o selo **"Prévia"** ao lado da marca (barra da home e topo
   do app; no celular, no topo do menu e no rodapé da página), que abre o resumo:
   o produto não foi lançado, pessoas, agendas e números são ilustrativos,
   nenhum dinheiro entra ou sai. Nenhuma tela carrega banner. O que
   CONTINUA dito no lugar: a assinatura gov.br simulada (é ato com efeito
   legal) e o que sobe no convite de lançamento (é dado pessoal). Tirar o
   selo também seria apresentar gente fictícia como real num domínio
   público — isso não se faz sem conversar.

Se for gerar imagem, texto de exemplo ou número: **derive dos dados ou deixe
claro que é demonstração** (desde 17/out · 5, "deixar claro" é o selo
Prévia, não um banner na tela). Número inventado em tela de venda já apareceu uma vez
aqui (uma função "som direto" que não existe em nenhum cadastro) e é o pior
defeito possível numa tela cujo trabalho é convencer.

---

## 25/out — mudou de casa: repositório AbsoluteZRO, build da Vercel e login único

⚠️ **O fonte oficial agora é `products/carro-do-freela` no repositório
AbsoluteZRO, que é PÚBLICO** (ADR 0013 da raiz). O repositório antigo fica
arquivado. Três consequências que valem para toda leva daqui em diante:

1. **Nenhuma chave no fonte.** Supabase e Web3Forms entram por
   `CARRO_SUPABASE_URL`, `CARRO_SUPABASE_ANON_KEY` e `CARRO_WEB3FORMS_KEY`
   na hora do build (marcadores `/*__…__*/` no template). Os HTML gerados
   (`public/index.html`, fases, artifacts, `landing/index.html`) **não são
   versionados**. A raiz do AbsoluteZRO roda `scripts/scan-secrets.mjs`.
2. **`npm run publicar` não publica mais.** Quem publica é a Vercel, com
   `node src/vercel-build.js` (as mesmas travas do publicar + a CSP
   calculada sem navegador, conferida contra o DOMParser pela suíte
   `seguranca`). Pôr no ar = PR mesclado na `main`, e só com o aval do Victor.
3. **"Continuar com Absolute ZRO"** (login único do HUB) mora em `api/zro/`
   e na tela de entrar (`#lg-zro`). O botão só existe no domínio: no
   `file://`, no artifact e nas suítes ele nasce e fica escondido.
   Suítes: `conta-zro` (tela) e `npm run test:api` (servidor, HUB falso).
4. **Conta única (25/out · 2, regra do titular).** Toda conta nova nasce na
   Absolute ZRO: no domínio, "Criar conta" vai ao HUB com `prompt=create`,
   e o formulário próprio e o Google só aparecem para quem já tinha entrado
   naquele aparelho (conta antiga). O direito de uso vem do admin da ZRO:
   sem `carro-do-freela` em `zro_products`, a pessoa entra mas vê só o
   aviso `#lg-bloq` — `entrarNaConta()` tem o portão (`zroBloqueado()`),
   então nenhuma porta abre a conta. Fora do domínio a prévia é a de sempre.
   ⚠️ A lista de convite (landing e "guardar") NÃO é conta e fica aberta.

Tudo — envs, Root Directory, fluxo — em `ORIGEM.md`.

## Como o projeto é construído

Um HTML sem framework, sem CDN, sem requisição externa — **mais a pasta
`m/` de mídia, do próprio domínio, ao lado dele** (desde 18/out · 2). Fontes,
rostos e ícones continuam em base64; vídeos e fotos geradas moram em
arquivo, cada um em versão leve e `@hd`, porque embutidos eles tinham de ser
encolhidos até ficar ruins no computador. Ver a seção de 18/out · 2.

```
src/template.html   markup + estilos + toda a lógica  (é AQUI que se edita)
src/crew.json       os 109 cadastros normalizados
src/assets/         fontes e frames em base64; os JSON de mídia apontam "midia:<nome>"
src/midia/          vídeos e fotos geradas, leve + @hd (50 + 50 arquivos)
        ↓  node src/build.js
public/index.html    documento completo → é o que vai para a WEB
public/artifact.html o mesmo sem <head> → é o que se PUBLICA como artifact
public/m/            a mídia com o hash no nome (saída; fora do git)
```

⚠️ **São duas saídas, e confundi-las estraga a entrega.** O template começa
direto no `<title>` porque nasceu para virar artifact: o visualizador monta
doctype/head/body por fora, **viewport inclusive**. Servido por conta própria
(Vercel), esse por fora não existe — e sem `<meta name="viewport">` todo
navegador de celular monta a página num viewport virtual de **980px** e
encolhe para caber: layout de computador, letra minúscula, e **nenhuma media
query de celular chega a valer** (no protótipo isso escondia o app inteiro de
celular — barra de ícones embaixo, coluna única). Aconteceu na landing e, uma
hora depois, aqui.

⚠️ **O Playwright não pega a falta da meta**: `viewport:{width:390}` define o
viewport de layout direto. Só reproduz com `isMobile:true` no contexto. As 31
suítes passavam verdes com o defeito no ar.

⚠️ **Vão entre dois elementos fixos é página aparecendo.** O painel de
suporte flutuava a 76px do fim e a barra de abas ocupava os 59px de baixo:
sobrava um vão de ~17px, e ali aparecia o conteúdo rolando. Não era o mesmo
defeito da faixa do iPhone — era geometria, e reproduziu no emulador em
428×781 (a medida que veio do `?diag` dele). No celular o painel virou
**folha de baixo encostada no fim**, largura inteira, cobrindo a barra, com
véu atrás. Regra geral: **dois elementos fixos empilhados ou encostam ou
alguém vê o que está atrás.**

⚠️ **A faixa embaixo da barra de abas no iPhone: NÃO se resolve pintando.**
Cinco tentativas falharam pelo mesmo erro de raciocínio — todas tentavam
*cobrir* o pedaço a partir de um elemento fixo (pseudo-elemento pendurado,
`box-shadow` com spread, elemento próprio em `bottom:0`, tirar o cover).
Nenhuma alcança: `position:fixed` ancora no viewport de **layout**, e o que
a pessoa enxerga é o **visual**, que cresce quando a barra do Safari encolhe
na rolagem. A diferença entre os dois É a faixa — a barra fica onde o layout
terminava e a página aparece no pedaço revelado abaixo dela.

O que resolve é a barra **parar no lugar certo**: `ancorarNoVisivel()` lê
`visualViewport.offsetTop + height - innerHeight`, publica em
`--sobra-baixo`, e `.bottombar`, `#tapa-baixo`, `#avisos`, `#fbk-btn` e
`#fbk-panel` andam junto por `translateY`. Onde não há diferença (desktop,
Android, qualquer navegador sem o comportamento) a conta dá **zero** e nada
muda — há teste exigindo exatamente isso, para o conserto não deslocar nada
onde não havia faixa. **Se voltar a vazar, meça no aparelho com `?diag`
antes de mexer**; não adianta tentar cobrir de novo.

⚠️ **`viewport-fit=cover` NÃO entra de novo sem um iPhone na mão.** Ele foi
ligado junto com a meta (o CSS da `.bottombar` usava `env(safe-area-inset-bottom)`)
e criou um defeito próprio: a página passa a pintar até a borda física do vidro
enquanto todo `position:fixed` fica preso à janela segura, então sobra uma faixa
embaixo onde o conteúdo rolado aparece por trás da barra de abas — e o mesmo em
cima, na faixa do relógio. **Duas tentativas de tapar a faixa falharam**: pseudo-
elemento pendurado (`::before`/`::after`) e `box-shadow` sólido com spread. As
duas cobriam a faixa no Chromium — medido, faixa de 62px simulada, opaca — e
nenhuma segurou no Safari real. O conserto foi **tirar o cover**: sem ele o
Safari não pinta ali, então não há faixa para tapar. `env()` vira zero e não faz
falta, porque sem cover o próprio Safari já mantém a página fora do recorte e do
indicador de gesto.

⚠️ **Tela grande é ZOOM, não caixa mais larga.** Primeira tentativa foi
alargar o `.wrap` (1160 → 1300 → 1420) e subir alguns tamanhos; o Victor
recusou olhando: aquilo empurra o conteúdo para a borda e a letra continua
pequena. O pedido era literal — *"como se tivesse dado um zoom, 125%
resolve"*. ~~Três degraus (1.1/1.2/1.3).~~ **Desde 18/out · 4 é uma conta
contínua**, e desde 18/out · 5 calibrada pelo Victor em três quartos:
`zoom = min(largura ÷ 1733, altura ÷ 1013)`, entre 1 e 2 (*"o ideal é como
se a tela tivesse em 75%"*), feita no script de dentro do véu (antes do
primeiro quadro) e de novo a cada resize. Abaixo de 1733px de largura não há
zoom; acima, a página desenha como uma janela de ~1733px.
A proporção inteira sobe junto e o 1160 segue sendo a medida de leitura.
Media query lê a largura real, não a com zoom.

⚠️ **`</div>` sobrando fecha o `.wrap` cedo e o resto da tela vai para a
borda.** Estava em `#v-meu`: tudo de "Tabela e regras" para baixo era filho
direto do `<section>`, sem caixa nem padding — colado no vidro do monitor.
Só apareceu com o zoom, porque em tela pequena a diferença some. Se uma
seção parecer "sem margem", cheque a árvore (`.wrap.contains(alvo)`) antes
de mexer em CSS.

⚠️ **`zoom` muda o significado de `100vh`.** Dentro de um `body` com
`zoom:1.1`, `100vh` continua sendo a janela REAL e desenha 10% mais alto que
a tela — qualquer "ocupa a janela inteira" passa a rolar. Existe `--zoom`
acompanhando cada degrau; quem precisa de altura de tela usa
`calc(100svh / var(--zoom,1))`. Desde 18/out · 4 o `--zoom` sai da mesma
conta contínua, e **toda** altura em `svh`/`vh` da tela de entrar passou a
dividir por ele. Foi assim que a tela de entrar passou a caber
sem rolagem. ⚠️ **Desde 18/out · 6 o `--zoom` é MEDIDO, não copiado do zoom**:
o Safari NÃO multiplica `svh` pelo zoom do corpo, então lá a divisão encolhia
a cena da home e a tela de entrar abaixo da janela em todo monitor grande.
Uma sonda de `100vh` dentro do corpo diz quanto o motor multiplica (Chromium:
o zoom; Safari: 1), e `--zoom` vira esse número.

⚠️ **A build se identifica** (`VERSAO`, hoje `19/out · 5`): aparece no rodapé do
menu e vai junto no recado de suporte. Sem isso, três rodadas foram gastas sem
saber se o defeito relatado era do arquivo novo ou de um cache velho. **Suba a
VERSAO em toda entrega que o Victor for subir.**

Nunca editar à mão nenhuma das duas — são geradas.

O `build.js` substitui os marcadores do template (`/*__FONTS__*/`,
`/*__CREW__*/`, `/*__FUNCOES__*/`, `/*__FRAMES__*/` e os de mídia), copia
`src/midia/` para `public/m/` com o hash no nome e monta `/*__MIDIA_HD__*/`.

```bash
npm run build              # nomes reais
npm run build:anon         # anonimizado
node src/build.js --fase=1 # um protótipo por fase do roadmap (1..6)
npm run dev            # http://localhost:5173
npm test               # todas as suítes
node test/run.js busca take     # só essas
```

Também no repositório, fora de `public/`:

| Arquivo | O que é | Estado |
|---|---|---|
| `docs/hotsite.html` | apresentação imersiva para sócio/investidor | **desatualizado** desde 9/ago |
| `docs/apresentacao.html` | deck 16:9, vira PDF | **muito desatualizado** |
| `docs/plano.html` | plano de ir ao ar: domínio, stack, custo, regulação | atual |
| `docs/prd.html` | **PRD + o corte do MVP**: problema, tese, receita, requisitos por área, roadmap faseado, riscos | atual (19/ago) |
| `docs/fase1-no-ar.html` | **o que falta para a Fase 1 funcionar de verdade**: decisões do Victor, contas, login com Google, banco, cobrança do Volante, segurança, promessas da tela, ordem e custo | atual (19/out · 2) |
| `public/identidade.html` | manual de identidade visual | atual |

Victor disse explicitamente para **não gastar tempo** com o hotsite e o deck: o
sócio já viu a plataforma rodando.

---

## Decisões de produto que estão no código

Elas foram discutidas e algumas foram revertidas. **Não "melhore" nenhuma sem
perguntar** — cada uma tem uma razão.

### Dinheiro

- **take (T$)** é a moeda, 1:1 com o real, sempre.
- **take nasce de RECEBIMENTO, nunca de DEPÓSITO.** Não existe "recarregar
  carteira" em lugar nenhum, e é decisão regulatória: saldo parado sem destino é
  conta de pagamento e exige autorização do BACEN; dinheiro que entra amarrado a
  uma transação específica é custódia, que pega carona na licença do parceiro.
  *Se aparecer a palavra "recarregar" numa tela de carteira, é bug.*
- **Taxa sai na venda, não no saque.** Já foi o contrário; Victor reverteu:
  *"as pessoas vão começar a armazenar dinheiro na conta"*. Saque é grátis.
- Brechó: **5%** anúncio normal, **10%** impulsionado, pagos pelo vendedor.
  **Sem teto no impulsionado** — argumento do Victor, melhor que o meu: quem
  destaca pode subir o preço acima do mercado para recuperar a taxa.
- Job com garantia: **6%** (4% na Frota), pagos por quem contrata.
  Cobrar do freela devolveria todo mundo para o Pix. Desde o sinal, quem contrata
  adianta 20% + taxa e paga o resto na entrega.
- **Destaque pago vale para equipamento, nunca para pessoa.** Vender posição
  para uma câmera é comércio; vender posição para o perfil de alguém destruiria
  o dado que é o produto.

### Contratação

- **Job é aceita ou recusa. Não existe contraproposta de diária.** Removida a
  pedido do Victor: cada rodada de barganha multiplica o trabalho de quem está
  montando escala de cinco pessoas. O sinal de preço volta pela recusa com motivo
  ("valor abaixo da minha tabela"), e a consulta é reenviada corrigida.
- Contraproposta de **valor continua no brechó** — ali pechinchar é normal e a
  negociação é entre duas pessoas sobre um item só.
- **Ninguém compra posição na busca.** Ordem é disponibilidade → agenda em dia.
- **Sem estrelas, sem top 10.** Reputação são quatro fatos de operação.
- **Verificado é grátis e conquistado** (perfil ≥85% + 6 jobs). Nenhum plano
  vende credibilidade.
- Ocupado é cinza, não vermelho — estar trabalhando não é erro.

### Quem vê a agenda de quem

Decisão recente e importante:

- **Ver a agenda ALHEIA é da conta de contratante.** Aberta a qualquer conta,
  vira lista de contatos de graça: entra como freela, anota quem está livre na
  quinta e liga por fora.
- Trancado para o freela: a **busca** (lista, filtros, tira de dias), **Montar
  equipe**, e a **aba Agenda** no perfil de outra pessoa. O **botão de consultar
  saiu da tranca** quando o Carona nasceu — chamar quem você já conhece é grátis;
  o que é pago é saber quem está livre.
- **Passar o carro sumiu inteiro do lado do freela** — abas e gaveta. Ele não
  passa vaga, ele recebe a chamada.
- **Montar equipe ficou visível, trancada, de propósito**: é a vitrine que vende
  a conta de contratante. Mostra o que ele ganharia + o **censo** (quantos
  profissionais existem por função).
- Continua do freela: a própria agenda, o perfil-portfólio de qualquer pessoa
  (público por decisão antiga — serve para a pessoa divulgar) e a caixa de
  propostas, onde ele *recebe* chamada sem nunca ver quem mais recebeu.
- Agregados **sem nome** ficam à vista (`63 na escuta de 109`, contagem por
  praça, censo por função): provam densidade sem entregar a lista.

**Decidido: o que separa quem contrata de quem só quer a lista é PAGAMENTO.**
Ver a agenda é o Volante, R$ 89/mês (`MENSALIDADE`, `ASSINANTE`).
`podeVerAgenda()` exige `MODO==="contratante" && ASSINANTE` — o lado existe sem
pagar (é o Carona), as telas de agenda é que ficam trancadas.

- **Entrar como contratante não cobra mais nada** (mudou com o Carona): a pessoa
  entra, monta o perfil e chama quem conhece. A tranca aparece quando ela tenta
  ver quem está livre.
- O botão do painel trancado mostra o preço e abre a mesma assinatura.
- Dá para pagar com **take**. Não fere "take nasce de recebimento": aqui ele está
  saindo, que é para o que serve. Quem vendeu uma lente paga quatro meses.
- **Cancelar fica na mesma tela de assinar**, no painel do contratante. Plano que
  só dá para assinar e não dá para cancelar no mesmo lugar faz a pessoa
  desconfiar do resto do produto. Cancelar não apaga nada — só fecha a agenda.

Eu havia recomendado verificação em vez de pagamento, porque cobrar antes de a
pessoa ver o inventário aperta o começo: ninguém paga R$ 89 para descobrir se tem
gente na praça. Victor decidiu pagamento, e depois **resolveu o cold start por
outro caminho, melhor**: o Carona. Agora ninguém paga para entrar; paga para ver
quem está livre. A tela trancada continua mostrando o *censo* antes do preço.

### Garantia opcional em "Fechar escala" — o problema de caixa do contratante

> **Leia junto com a seção seguinte.** O mecanismo descrito aqui (depósito de
> 100% por pessoa) foi substituído pelo sinal de 20% + contrato. O que continua
> valendo é a lógica de *quem* entra em garantia (`exige` / `aceita` / `não
> usa`) e o toggle mestre; o que mudou é *quanto* entra.

Victor levantou um problema real: 70% das vezes o contratante só recebe do
cliente dele DEPOIS de entregar o job. Exigir 100% da equipe depositada na hora
de fechar a escala (como era até então) pressupõe um caixa que a maioria das
produtoras pequenas não tem.

Não existe solução mágica — a garantia só protege o freela porque o dinheiro
está em custódia ANTES dele recusar outro job naquele dia. Dar prazo ao
contratante sem tirar a proteção do freela não é possível com a infraestrutura
deste protótipo (isso pediria crédito/factoring, capital e risco de crédito —
fora de escopo).

**A solução foi usar o que já estava nos dados** (`c.gar`, `c.exige`, 74%/26%)
em vez de tratar a escala como tudo-ou-nada:

| Categoria do freela | O que acontece em "Fechar escala" |
|---|---|
| `exige` (26% dos que aceitam) | depósito obrigatório, sem escolha — é a palavra dele |
| `aceita` mas não exige | opcional — toggle "Pagar com garantia" (padrão ligado) |
| não usa garantia | sempre acerto direto — sem depósito, como no WhatsApp hoje |

O contratante sem caixa só precisa ter dinheiro pra quem exige; para o resto,
pode negociar acerto direto sem abrir mão da equipe inteira. `comGarantia(x)`
decide por pessoa; `garEscOn` é o toggle mestre que só afeta quem aceita-mas-
não-exige.

O que isso mudou:
- `escaladas()` carrega `exige`/`aceita` por pessoa; `PAGOS`/depósito só nascem
  para quem está em garantia — quem é acerto direto nunca entra em custódia.
- `equipe` no job guarda `gar:true/false` por pessoa (`temDeposito(x)`, que
  trata jobs semeados sem o campo como garantia integral — comportamento antigo
  preservado).
- **Cancelamento respeita isso**: `contasCanc()` só reparte dinheiro entre quem
  tinha depósito; quem era acerto direto aparece à parte, avisado sem conta.
- **Editar a escala**: "Acrescentar alguém" não abre um checkout novo, então
  quem entra por ali nasce `gar:false` — a nota antiga prometia depósito
  automático e isso nunca existiu de fato (bug herdado da sessão anterior,
  corrigido junto). Remover alguém que tinha depósito limpa o registro em
  `PAGOS` para não sobrar pagamento fantasma de gente fora do job.

**Débito aceito conscientemente:** removido de um job após fechado, quem tinha
depósito não recebe estorno automático — não existe neste protótipo uma conta
do contratante com saldo próprio além do que ele já gastou, só o registro em
PAGOS. Documentado aqui, não escondido.

### Sinal de 20% + contrato eletrônico (IMPLEMENTADO)

Substituiu a garantia integral. **A seção "Garantia opcional" acima descreve o
mecanismo anterior** — o toggle por pessoa continua existindo, mas o que ele
liga agora é sinal+contrato, não depósito de 100%.

**Por quê:** a garantia integral pedia 106% adiantado (valor cheio + 6%). Como
70% das vezes o contratante só recebe do cliente dele DEPOIS de entregar,
quem podia escolher fugia para o acerto direto — não por má-fé, por falta de
caixa na data. Com sinal, o adiantado cai para 26% (ou 24% assinante).

| Momento | O que acontece |
|---|---|
| Fechar escala | contratante paga **20% de sinal + taxa** (6%, ou 4% assinante) sobre o valor cheio |
| Assinatura | os dois assinam pelo gov.br; **a vaga só fica ativa com as duas** |
| Entrega | o freela registra que entregou (`entregue`) |
| Conferência | o contratante confirma (`recebido`) → libera os 80% daquela pessoa |

**Liberação é por função, nunca por job.** Quem opera câmera fecha no dia;
quem edita fecha quando o corte sai. Cada vaga anda sozinha — foi o Victor
que levantou isso, e teria dado errado modelar como evento único do job.

**Estado por pessoa** (em `ESCALAS[].equipe`): `gar`, `sinal`, `taxa`,
`assFreela`, `assProd`, `entregue`, `recebido`. `faseVaga(x)` reduz isso a uma
das fases de `FASES` (`contrato`/`ativa`/`conferir`/`liberado`/`direto`/`antigo`).
`antigo` existe para jobs semeados, que não têm os campos novos — `depositado(x)`
devolve o valor cheio neles, preservando o comportamento antigo.

**O contrato é por dupla, não por job.** `blocoContratos()` mostra ao contratante
todas as vagas (ele é parte em todas) e ao freela só a dele. O modal `#ovl12`
tem o texto completo (partes, objeto, valor/sinal, cancelamento, foro) e as duas
assinaturas. **A assinatura gov.br é simulada** e a tela diz isso — não existe
integração real, e prometer que existe seria o tipo de mentira de UI que este
projeto trata como bug.

**PAGOS ganhou o estado `sinal`** (além de `custodia`, dos jobs antigos, e
`liberado`). `pagoRetido()` soma os dois primeiros. Ao liberar, a entrada vira
`liberado` com o valor cheio — não cria uma segunda entrada, senão o extrato
contaria o sinal duas vezes.

**Cancelamento opera sobre o sinal.** `REGRAS_CANC` continua igual, mas incide
sobre `depositado(x)`, não sobre a diária: o restante nunca foi cobrado, então
não há o que reter nem devolver dele.

**Argumento de venda — são duas coisas distintas:**
- **Assinatura (R$89/mês) responde "onde eu acho gente?"** — ver quem está
  livre, escala com custo somando, time salvo, histórico, passar o carro.
- **Taxa (6%, ou 4% no Premium) responde "e se der errado?"** — sinal em vez
  do valor cheio, contrato assinado, pagamento final só com a conferência
  dele, e se o freela furar ele perde só o sinal, com registro no perfil.
- **A frase que amarra**: a assinatura faz achar rápido; o sinal e o contrato
  fazem fechar tranquilo. Uma sozinha resolve metade.

### Carona, Volante, Frota — os três níveis de quem contrata

**O muro estava na porta.** Sem R$ 89 o contratante não fazia nada, e quem não
entra não gera job — que é o que segura o freela aqui. Victor propôs o grátis
dos dois lados; foi ele que viu que o paywall na entrada estava matando as duas
pontas ao mesmo tempo.

| | Carona (grátis) | Volante (R$ 89) | Frota (R$ 189) |
|---|---|---|---|
| Perfil de contratante | sim | sim | sim |
| Chamar quem já conhece | sim | sim | sim |
| Contrato + sinal | sim | sim | sim |
| **Ver quem está livre** | — | **sim** | sim |
| Montar equipe, passar o carro, Meu time | — | sim | sim |
| Cláusulas, relatório, recorrente | — | — | sim |
| Taxa por job | 6% | 6% | **4%** |

**A frase que resume o produto inteiro: você pode chamar quem quiser; só quem
paga sabe quem está livre.** O Carona não vaza a agenda porque ele só chama
gente que já conhece pelo nome — é exatamente o que ele faz no WhatsApp hoje,
só que aqui rende contrato, sinal, registro e os 6%. Receita de transação sem
mensalidade é o que deixa a base crescer.

Os nomes vêm do carro, que é o nome da casa. `PLANOS` guarda os três;
`planoAtual()` deriva de `ASSINANTE`/`PREMIUM_PROD`, que continuam sendo o
estado real — Carona é simplesmente contratante sem assinatura.

**Entrar como contratante não abre mais a assinatura na hora** (era o
comportamento antigo, e várias suítes dependiam dele — o helper de teste agora
chama `abrirAssinatura()` explicitamente quando precisa da agenda). O botão de
consultar no perfil de alguém saiu de trás do `podeVerAgenda()`; a **aba de
agenda daquela pessoa continua trancada**.

### Coletivos

Vem de uma conversa sobre valorização das mulheres no audiovisual — mercado em
que, segundo o Victor, elas são muito desvalorizadas. A peça é genérica de
propósito: coletivo é qualquer grupo que se organiza.

**A decisão que importa: a busca filtra por COLETIVO, não por gênero.** Um
filtro de gênero exigiria dado que ninguém declarou no cadastro (conferido:
não existe campo de gênero em `crew.json`), e um filtro que serve para achar
mulheres serve igual para evitá-las. Coletivo dá a mesma descoberta e o
controle fica com quem é filtrado, porque é opt-in.

**Ninguém nasce dentro de um coletivo.** Marcar cadastro real como integrante
de coletivo de mulheres seria atribuir gênero que a pessoa não informou — a
mesma regra que vale para diária e para defeito de equipamento. `integrantesDe()`
devolve a contagem real (0 até alguém entrar), e há teste garantindo isso.

Peças: `COLETIVOS`, `MEUS_COLETIVOS`, `coletivosDe()`, `seloColetivos()`,
`abrirColetivo()` (modal `#ovl15`), filtro `#f-col` com `S.col`, e o bloco de
adesão no perfil do freela (`#pr-col`).

**Pendente do mundo real:** o Victor quer uma **embaixadora** (storymaker
conhecida de Natal) e parceria com o **Aurora**, grupo de mulheres do marketing
daqui. Nada disso pode entrar no protótipo com nome, rosto ou marca antes do
aceite delas — é endosso, não listagem, e isso é mais sério que os 109
cadastros. O coletivo semeado (`Elas no Set`) é fictício de propósito, para ele
poder mostrar a página antes de pedir o sim.

**Também discutido e não construído:** publicar censo por gênero (exigiria
campo autodeclarado e opcional no cadastro, usado só no agregado, nunca como
filtro nem selo) e avisar na caixa de propostas quando o valor está abaixo da
**faixa da praça**, não só da tabela da própria pessoa — esse segundo é o que
mais mexe com desvalorização, porque quem nunca publicou tabela só tem essa
âncora. Os dois seguem disponíveis.

### Guildas

Ideia do Victor, vinda de Ragnarok: contratante que não tem produtora ainda
assim tem gente com quem sempre roda. O mercado de Natal já funciona em
panelinha — a guilda é a panelinha com memória.

**Guilda ≠ coletivo**, por decisão dele: coletivo é causa e afinidade e é só de
freela; guilda é grupo de trabalho e aceita contratante junto. Dá para estar
nos dois ao mesmo tempo.

O que ela faz: **time compartilhado** (a estrela que você marca dentro da
guilda entra no time do grupo, e aparece pra todo mundo da guilda na tela de
escalar), **brasão** ao lado do nome, **fatos agregados** e **nível** (3 jobs
por nível, contando só job fechado por quem estava na guilda).

> ⚠️ **O limite que não pode cair:** a guilda muda o que a PRÓPRIA guilda vê,
> nunca a ordem global da busca. Se estar numa guilda forte empurrasse alguém
> pra cima na busca dos outros, seria o top 10 de volta — a mesma concentração
> que o Victor já rejeitou, por capital social em vez de dinheiro, e pior,
> porque não dá nem pra entrar pagando. **`filtrar()` não conhece guilda**, e
> há teste garantindo que a ordem é idêntica com e sem.

Sobre o nível: eu apontei que é o que mais se aproxima do placar que ele matou
lá atrás. Ele decidiu ter mesmo, ciente disso. Construí **sem tela de ranking
entre guildas** — nível é fato da própria guilda, não classificação contra as
outras, e há teste para isso. Placar seria outro pedido, consciente.

Peças: `GUILDAS`, `MINHA_GUILDA`, `GUILDA_TIME`, `nivelGuilda()`,
`jobsDaGuilda()`, `brasaoDe()`, `abrirGuilda()` (modal `#ovl16`),
`blocoGuildaTime()` na tela de escalar. `e.guilda` grava no job qual guilda
fechou — job fechado fora da guilda não conta pra ela.

### Enxugar a busca — a leva de redesign

Victor pediu comparação com Uber, iFood, WhatsApp e Facebook: mais leve, mais
limpo. O diagnóstico foi contado, não opinado: **cada linha da busca carregava
10 informações e 7 contornos**, e a mono maiúscula estava em label, status,
badge e metadado — ela é o recurso mais pesado da tipografia e tinha virado o
padrão.

**A linha** (`linhaDe`): 4 informações, nenhum contorno, ~68px em vez de ~96.
Nada saiu do produto, mudou de lugar — equipamento e funções extras no perfil,
agenda em dia na reputação, garantia virou filtro (que já existia). "Na escuta"
virou **ponto de presença no avatar** (`.pres`) + a palavra; verificado virou
só o ícone (`CHECK_VF`).

**A tira de dias**: sem borda, sem barra de proporção (o número de livres já
era a barra — duas representações do mesmo dado). Só o dia ativo tem fundo.

**Os filtros** (`.fq` / `.fpil`, `drawFbar()`): barra horizontal com os três
que resolvem a maioria das buscas + "Filtros" com contador. `painelFiltros`
controla o painel lateral, que continua **inteiro** — só deixou de estar aberto
o tempo todo. `.cols.recolhido` esconde o aside.

**Tokens**: mono só para número (`.mini`, `.selo`, `.tg`, `.selog`, `.vf`,
`.count` saíram do mono); raios reduzidos a `--r-caixa`/`--r-chip`/50%.

⚠️ **Quatro colisões de classe numa leva só** — `.resp`, `.fb`, `.fbar` e
`.mais` já existiam e venciam por vir depois no arquivo. O CSS aqui é um
namespace global num arquivo único: **antes de criar classe, `grep` o nome.**
A suíte `colisao` existe por isso, e a de contraste passou limpa depois de tudo.

**Não mudou**: tema escuro (leve ≠ claro), identidade, vocabulário do set,
nenhuma decisão de produto. **Pendente de validação de mercado**: tirar
equipamento da lista pressupõe que ninguém escolhe freela pela câmera batendo
o olho — Victor aprovou, mas é a parte que depende de conhecer o mercado.

### Temperatura, grão e paleta de dado

Victor: *"está com cara de IA"*. Estava — e não era o layout, era a paleta.
**Preto-azulado com ciano neon é o clichê nº 1 de interface gerada**: fundo
frio, acento de saturação máxima, nenhum material na tela.

- **O cinza deixou de ser azulado** (`#0E1216` → `#121110` e toda a escada
  junto). Neutro-quente, na temperatura de equipamento de set — corpo de
  câmera, fita gaffer, case. **Mesma luminância**, para a auditoria de
  contraste continuar de pé; ela passou nos dois temas depois da troca.
- **Grão** (`body::after`, feTurbulence em data URI, `opacity:.05`,
  `mix-blend-mode:overlay`). O produto é audiovisual: grão é o material da
  casa, e é o que faz uma tela escura parecer alguma coisa em vez de um
  template. Some com `prefers-reduced-motion`.
- **Paleta de DADO separada da semântica** (`--d1`..`--d6`, dessaturadas).
  Antes o gráfico usava ciano e verde — as mesmas cores de "clicável" e
  "livre". Quem batia o olho lia significado onde não tinha. **Nenhuma cor
  de dado existe em botão**, e é para continuar assim.
- **Barra empilhada** (`pilhaHTML()`, `.pilha`/`.plg`) no relatório de custo
  e no censo: uma barra só responde "quanto do meu custo é câmera?", que é a
  pergunta. Barrinhas soltas respondiam outra, pior.
- **Segmentado com pílula sólida** (`.segm`): o ativo é `--cal` sobre trilho,
  não ciano — o contraste diz qual está ligada sem depender de cor.

⚠️ Mais **duas colisões de classe** aqui (`.pl` era a linha do plano Premium,
`.pv2` o preço do anúncio) — somando **seis nesta leva de redesign**. Repetindo
porque é a armadilha nº 1 deste arquivo: **`grep` o nome antes de criar
classe.**

### Varredura de plataforma inteira — a terceira leva

Victor pediu para reanalisar tudo: melhorias, animação onde couber, bonito,
limpo, viciante, sem cara de IA e sem ser monótono. A varredura foi feita com
19 screenshots do Playwright a 1440px (`erros: nenhum` em todas). O que ela
achou, em ordem de impacto:

**1. MONO ERA ENFEITE, NÃO DADO.** Quarenta blocos de CSS combinavam
`font-family:var(--mono)` com `text-transform:uppercase`: "TRABALHOS",
"ESCOLHA A CATEGORIA", "AGUARDANDO" 63 vezes na mesma coluna. Mono em rótulo
é o tique visual nº 1 de interface gerada e, pior, apaga a diferença entre
rótulo e dado — que é justamente o que mono deveria marcar. A regra agora é
uma só: **mono é número**. Rótulo é a fonte da casa em peso 600, caixa alta
curta, tracking apertado. A troca foi feita por varredura dos blocos, não à
mão, e o número voltou a ser a única coisa mono na tela.

**2. A barra do topo cortava palavra.** Ela herdava o `.wrap` de 1160px do
conteúdo e, com dez abas + carteira + menu + usuário, "Brechó" morria no
degradê e "Aprender" era inalcançável. O conteúdo continua em 1160 (medida de
leitura); **a barra vai a 1480**, que é o que Facebook e iFood fazem pelo
mesmo motivo.

**3. Hierarquia de botão invertida no painel da escala.** Um botão teal
desabilitado com um magenta sólido embaixo: o mais alto da tela era a ação
*secundária*. A marcação já pedia `btn mg gh` (magenta fantasma), mas `.mg`
vinha depois de `.gh` na folha e levava o fundo — **sétima colisão da série**.
E `[disabled]` deixou de ser só `opacity:.5` (ciano a 50% ainda lê como
botão): vira superfície neutra, a cor de ação some.

**4. Zero como primeira impressão.** O perfil abria com "0 TRABALHOS ·
0 CLIENTES" e o painel de custo com cinco zeros. Zero não é resultado, é
ainda-não. O perfil reordenou por força do sinal (jobs concluídos e resposta
vêm da plataforma; trabalhos e clientes dependem do cara ter subido
portfólio) e o zero **recua sem sumir** — esconder número ruim é mentir.
"Perfil completo" virou **anel** (`conic-gradient`, `.pring`): é a única
métrica ali que o dono da conta mexe hoje à tarde. O painel de custo só vira
contabilidade quando há o que contar, e ganhou a barra por função
(`custoPorFuncao()`, a partir de duas pessoas — com uma fatia a barra não
compara nada).

**5. `pessoa(s)`, `job(s)`, `anúncio(s)` em 17 lugares.** O parêntese de
programador. iFood não escreve "2 item(ns)". Helper `pl(n,uni,mul)`.

**6. Vazio sem saída.** Portfólio vazio era uma caixa tracejada que dizia o
que fazer e não oferecia como; categoria vazia no brechó repetia "ninguém
vendendo". Agora o vazio do dono leva a publicar, o de terceiro leva pra
próxima aba, e a categoria sem anúncio convida a anunciar — é a única tela
onde o vazio vale mais que o cheio.

**7. Passar o carro: 63 linhas dizendo "AGUARDANDO".** Antes de mandar,
ninguém está aguardando nada. O estado só aparece depois que o carro passa, e
entrou cabeçalho com a conta viva + Todos/Nenhum (com 63 marcados, quem quer
mandar pra 5 desmarcava 58 à mão).

**Movimento — três coisas, e só três** (animação demais é o outro jeito de
parecer gerado): **escada** (`.esc`, delay por `--i` setado no HTML, limitado
a 10 — nth-child até 63 seria uma folha inteira) no ranking de guilda, grade
do brechó e portfólio; **pressão** (`:active` afunda 1px em tudo clicável),
que é o feedback que app nativo tem e página não; **contagem** (`contar()`,
~600ms) nos quatro números da home. Tudo cai no bloco global de
`prefers-reduced-motion`.

Também: nível de guilda virou **barra** (`andarNivel()`, `.gnv`) porque
número sem chão não faz ninguém querer fechar mais um job; pódio nos três
primeiros; e o aviso de demonstração das guildas usava `.aviso2` solto, que
não é flex — o triângulo colava na palavra. Passou a ser o mesmo `.aviso` das
outras duas telas.

### Apple/Samsung: foto no brechó e explicador que recolhe

Victor somou Apple e Samsung às referências e autorizou executar os dois
pontos do diagnóstico ("mostram o produto, nós descrevemos" e "texto
explicativo demais para quem já usa").

**1. Fotografia de categoria no brechó** (`FOTO_CAT`, `.catfoto`). Série de
nove imagens geradas no Higgsfield (Nano Banana 2): mesma luz, mesmo fundo
neutro-quente da interface, **sem marca, sem texto, sem pessoa**. São capas
de CATEGORIA — nunca foto de anúncio: colar imagem gerada num item real do
Victor mentiria sobre o estado do equipamento dele, e num item de
demonstração viraria "foto do produto" falsa. A capa genérica não afirma
nada sobre item nenhum.

- Encanamento: `src/assets/brecho-fotos.json` (webp 560px, data URIs, ~88 KB
  no total) → marcador `/*__BRECHO_FOTOS__*/` no `build.js` → `FOTO_CAT` no
  template. Nenhuma requisição externa; o arquivo continua funcionando
  offline.
- Como as imagens chegaram aqui: o ambiente bloqueia o CDN do Higgsfield
  (403 do proxy de rede). A saída foi o `sandbox_exec` do próprio MCP —
  baixar e comprimir lá (`convert -resize 560x -quality 50`) e trazer o
  base64 pelo canal da ferramenta, **uma imagem por chamada** (o resultado
  trunca perto de 20 KB).
- Fotografia escura compensa nos dois temas: no claro ela lê como catálogo
  editorial sobre papel. Categoria vazia ganha `grayscale+brightness` para
  recuar.

**2. Explicador que recolhe** (`.explica`/`data-exp`, `.explitog`,
`VISTOS`/`cdf-visto` no localStorage, suíte `explicador`). Toda tela abre
com parágrafos explicando o conceito; quem chegou agora precisa deles, quem
usa já decorou. O parágrafo aparece inteiro na primeira visita e recolhe num
"?" ao lado do título **a partir do carregamento seguinte** — nunca no meio
da sessão, que seria tapete puxado. Essa escolha também protege os testes:
cada suíte roda num carregamento só, então nenhum texto some no meio de uma
asserção. O "?" reabre e fecha com `aria-expanded`.

Agora são **28 suítes**.

### A leva grande de 16/ago: salão, regras de guilda, lado do freela e vendas

Batch do Victor com decisões novas de produto. O que entrou e POR QUÊ:

**Guilda virou lugar (o salão).** Entrar numa guilda leva a uma view cheia
(`v-salao`, `abrirSalao`/`drawSalao`): brasão na parede, roster de membros
com presença, mural interno, chat de grupo estilo WhatsApp (bolhas com
autor, chips de atalho, mesma `FIOS`+`ligarChat` de sempre) e a escada de
conquistas. O modal `ovl16` continua sendo a ficha de quem está DE FORA.
Guilda demo mostra integrantes **anônimos** ("Integrante 01 · Direção") —
guilda fictícia não ganha elenco com cara de gente real — e carrega o
aviso de demonstração (`sl-demo`).

**Regras novas** (decisões dele, números meus a validar):
- Aba Guildas é **só de contratante** (`data-modo="contratante"`).
- **Carência de 7 dias** ao sair (`CARENCIA_ATE`, `emCarencia()`) — como
  Ragnarok; sem isso guilda vira filtro liga-desliga. Teste que precisa
  re-entrar zera `CARENCIA_ATE` via evaluate.
- **Teto 15 membros**, VIP sobe a 30 (`GUILDA_MAX/_VIP`, `tetoGuilda`).
  Maresia está 15/15 (cheia) e Dunas é VIP na demo de propósito.
- **Fundação paga: R$ 249** única (`TAXA_FUNDACAO`) + **VIP R$ 49/mês**
  (`GUILDA_VIP_MES`) — âncora: abrir empresa custa taxa de junta; ficou
  abaixo de um mês de Frota. Fluxo em `ovl18` (nome, tag, cor).
- **Benefícios por nível** (`BENEF_NIVEL`): nv3 mural, nv5 salão decorado,
  nv10 +2 vagas, nv15 **taxa 5% em job com 3+ do time da guilda** (alavanca
  de negócio — proposta minha, precisa de ok), nv20 selo veterana. Nada
  toca a busca global — linha que não se cruza.

**Lado do freela:**
- Login de freela cai em **Propostas** (o dia dele começa em "quem me
  chamou", não na praça). Suítes que iam à praça agora fazem `show('pracas')`.
- **Softskills** autodeclaradas (`EU.soft`, máx. 8) com sugestões em
  datalist; chips no perfil público (`#p-soft`). NUNCA inventar softskill
  para pessoa real — só o dono declara.
- **Toggle freela↔contratante** no topo (`#modo-tog`) para ASSINANTE —
  quem paga o Volante tem os dois chapéus.

**Avaliação mútua SEM estrelas** (`AVALIACOES`, `ovl19`): depois do job
liberado, cada lado marca 3 fatos + "trabalharia de novo?". O agregado é
FRASE no perfil ("2 de 3 dizem que trabalharia de novo"), nunca nota —
nota vira ranking, e ranking é o que a casa jurou não ter.

**Vendas:** planos padrão Artlist (preço-herói 40px, selo "Mais escolhido",
✓ na lista, um CTA por card — só o destacado é sólido); logo das duas
barras leva à homepage (`.brand-home`); seção de prova social na home com
números DERIVADOS dos dados e o aviso de que depoimento só entra com nome
e autorização — nada inventado.

### Ajustes de 16/ago (segunda rodada do batch)

- **Aba Guilda volta para o freela**, no SINGULAR. Duas tabs com o mesmo
  `data-tab="guildas"`, separadas por `data-modo` — mesmo padrão das duas
  "Meu perfil" que já existiam. Freela = "Guilda" (ele tem uma); contratante
  = "Guildas" (diretório, e é onde se funda). `gl-fundar` esconde para
  freela. ⚠️ Seletor de teste PRECISA do `[data-modo=...]`: sem ele o
  Playwright dá strict-mode violation com 2 elementos.
- **Painel trancado mostra os dois planos** (`.doisp`/`.dp`), não só o
  Volante: quem cai ali pode já estar pronto para a Frota. `data-virar`
  passou a carregar o nome do plano e `abrirAssinatura(qual)` abre já nele.
- **Terceiro plano do freela: Estrada, R$ 49/mês** (`PLANOS_FREELA`).
  Vocabulário rodoviário da casa (Carona/Volante/Frota → Estrada = quem
  está na estrada o ano todo). Conteúdo: cláusulas próprias, tabela por
  tipo de cliente, reserva com sinal de cliente de fora, link limpo do
  portfólio, fila no suporte. **Nada compra posição nem selo** — a regra
  dura vale igual nos planos novos. A home tem 6 planos, 3 por lado.
- **Montar equipe/Passar o carro trocam o lado sozinhos** para quem
  assina (`show()` vira o MODO antes de trocar de tela). Quem pagou para
  contratar não deveria lembrar de virar a chave; o toggle do topo mostra
  a troca, então ninguém fica sem saber de que lado está.
- **Guilda também na barra de baixo**, nos dois modos. Abaixo de 820px a
  faixa de abas some (`.top .tabs{display:none}`), então sem entrada ali
  a guilda não existia no celular — que é onde o freela vive. Fica com
  **6 itens no lado freela** (cabe: 65px por item a 390px; abaixo de
  380px o rótulo cai para 9.5px em vez de quebrar) e 5 no de contratante.
  O escudo carrega ponto de não-lido do salão (`#bg-gui`, sem número: no
  celular importa "tem coisa nova lá", não quantas).
- **Arte no brasão da guilda** (`g.foto`), na fundação e no salão, pelo
  mesmo `lerImagem` do logo da produtora (canvas → data URI, 320px:
  o maior uso é o brasão de 76px). A tag de 3 letras vira o **fallback**
  e continua no DOM como texto alternativo — dá para voltar para ela.
  ⚠️ Toda pintura de brasão passa por **`brasaoBG(g)`**: eram 8 lugares
  repetindo `color:cor;background:cor1f`, e sem centralizar a foto
  apareceria em uns e não em outros. Se criar mais um lugar com brasão,
  use a função.

### Parcimônia de acento — a regra Linear/Stripe

Victor pediu padrão B2B premium (Linear, Stripe, Vercel). A auditoria achou
o ciano em ~110 lugares: preço, número de censo, hora, inicial de avatar,
chip de função, borda de hover. **Quando o acento está em tudo, ele não
aponta nada.** Regra da casa a partir daqui, e vale para qualquer cor nova:

- **ACENTO** (ciano) = ação primária, aba ativa, seleção, link. Só.
- **DADO** = neutro (`--cal`/`--cal-fraco`), mono se for número. Preço em
  ciano era o pior caso: preço é dado e competia com o botão da tela.
- **HOVER** = borda neutra mais forte (`--cal-tenue`); ciano no hover só
  quando o hover É a ação (ex.: o chip "Escalar").
- **Avatar/inicial** = identidade, nunca acento (`--cal-fraco`).
- `.subaba` ativa virou pílula `--cal` sobre trilho (o desenho do `.segm`):
  no brechó havia dois blocos ciano-sólido gritando juntos — aba ativa e
  CTA. Agora o CTA é o único ciano da tela.
- O que CONTINUA ciano de propósito: selo verificado (credencial),
  checkbox/toggle (`accent-color`), links, seleção (`.jcard.on`,
  `.eqtog[aria-pressed]`), foco (`:focus-visible`).

Do mesmo pedido: vazio com saída nos dois piores casos (busca sem resultado
ganhou **Limpar os filtros**; Passar o carro sem candidato calcula e oferece
**a próxima data em que tem gente livre** — o sistema sabe, então diz) e o
topo das telas subiu de 30px para 42px de respiro. **Skeleton loader ficou
de fora de propósito**: o protótipo não tem requisição — tudo renderiza no
mesmo frame, e skeleton aqui seria simular latência que não existe. Se um
dia houver backend, aí sim.

### A guilda como lugar: aba, ranking, chat e líder

Segunda rodada de guildas, pedida pelo Victor depois de testar. O que entrou:

- **Aba Guildas** (`v-guildas`, `drawGuildas()`) com **ranking por número** —
  ordenado por job fechado, desempatando por quanto a guilda movimentou. Ele
  pediu explicitamente "ranking por números, não por compra de posicionamento",
  e a tela diz isso em cima do ranking. **Nenhum plano sobe guilda no ranking**,
  e isso é regra, não detalhe.
- **Guildas semeadas são entidades FICTÍCIAS**, com líderes fictícios, do mesmo
  jeito que "Produtora Maré" é uma produtora fictícia. Nenhum dos 109 cadastros
  reais aparece como integrante ou líder — seria atribuir vínculo que a pessoa
  não declarou. Os números delas (`demoJobs`, `demoFat`, `demoMembros`) são
  demonstrativos e a tela tem banner dizendo isso. **Só a guilda em que você
  entra acumula número de verdade.**
- **Chat interno** (`fio("guilda-"+id)`, reusando o sistema de fios) — só carrega
  para quem está dentro. Entrar deixa mensagem de sistema no fio.
- **Líder** de cada guilda mostrado no ranking e no modal.
- **Brasão passou a vir com o nome junto** (`guildaChip()`): o Victor não estava
  reconhecendo a sigla sozinha no perfil. A sigla pura (`brasaoDe()`) continua
  nas linhas da busca, onde não cabe mais que isso.

### Quem lidera no set

Observação do Victor: quem contrata muitas vezes não vai ao evento, e alguém
precisa responder pelo dia. `e.lider` guarda quem, escolhido **entre quem já
está escalado**, no painel do job e só por quem contrata — o freela vê quem é,
não escolhe. Não paga a mais por isso: é função, não cargo; se for pra pagar,
ajusta-se a diária na edição da escala.

⚠️ A linha do líder usa `.lidl`, **não `.edl`**. Reusei `.edl` primeiro e a
suíte `cancelar-e-editar` pegou na hora: ela conta `.edl` para saber quantas
pessoas estão na edição da escala, e o líder virava uma linha a mais.

### À venda no perfil

Aba nova no perfil de qualquer pessoa (`data-pane="vende"`, `anunciosDe()`,
`drawVendeTab()`) com o que ela está vendendo no brechó. Quem abre o perfil de
alguém está avaliando com quem vai trabalhar — e quem vende equipamento
geralmente é a mesma pessoa. Juntar economiza uma volta inteira.

### Som e movimento

- **Passar o carro toca buzina + motor.** Os dois sons já existiam na paleta e
  nunca tinham sido usados — é literalmente o carro passando, que é o nome da
  coisa. O botão também anima (`.passou`).
- Animações: `.entra` (troca de tela), `.sobe` (item que entra numa lista),
  `.pulsa` (linha que mudou de estado), `.passou`.
- **Todas dentro de `@media(prefers-reduced-motion:reduce)`** — quem desliga
  movimento no sistema não recebe nenhuma, e há teste conferindo que a regra
  existe.
- Sons novos em: escalar alguém, favoritar/desfavoritar, assinar contrato,
  registrar entrega, trocar filtro de pagamento, entrar em guilda.

### Os dois planos na tela de assinatura

Mostrar só o Volante escondia metade da oferta: quem contrata toda semana nem
sabia que a Frota existia. `#as-plano` alterna entre os dois com as vantagens de
cada um (`VANTAGENS`), e o texto de comparação diz **a partir de quando o mais
caro compensa e quando não compensa**. Assinar direto pela Frota já entra como
Frota.

### Apenas mulheres — o filtro sem inverso

Pedido do Victor: um botão **Apenas mulheres**, sem "apenas homens", e com elas
continuando na lista geral.

Eu tinha levantado que filtro de gênero serve tanto pra achar quanto pra
evitar. **O desenho dele resolve**: sem o inverso, ninguém filtra pra excluir
com um clique; e como elas não saem da lista geral, o filtro soma visibilidade
em vez de separar em gueto. Registro isso porque a objeção era minha e a
solução é dele.

**O dado é sempre autodeclarado e opcional** (`GENEROS`, `c.genero`, campo em
`#pr-genero` e `#cd-genero`). Não existia campo de gênero nos 109 cadastros e
**não dá pra deduzir do primeiro nome** — seria inventar dado sobre pessoa
real, a mesma regra da diária e do defeito de equipamento, e ainda erraria com
gente de verdade dentro do produto. Então o filtro **nasce vazio e enche por
declaração**, igual ao coletivo, e o estado vazio explica isso em vez de
parecer defeito.

O campo **nunca vira selo no perfil e nunca entra na ordenação** — existe só
pro filtro e pra contagem agregada. Há teste para as duas coisas.

Isso também destrava o censo por gênero por função, que a gente tinha
discutido e adiado por falta de dado. Ainda não construído.

### Contratante Premium — R$ 189/mês

Os 4% eram do assinante comum. **Victor cortou**: o R$ 89 já cobra pelo acesso
à agenda, e dar a taxa reduzida junto era entregar duas coisas por um preço só,
sobrando pouco para vender depois. Os 4% viraram do Premium, que é onde há
valor a mais para justificar.

| | Contratante R$ 89 | Premium R$ 189 |
|---|---|---|
| Agenda, escala, histórico | sim | sim |
| Taxa por job | 6% | **4%** |
| Cláusulas próprias no contrato | — | sim |
| Relatório de custo + CSV | — | sim |
| Escala recorrente | — | sim |

**O preço se auto-seleciona por volume**: 2 pontos de taxa só devolvem os R$ 100
a mais em quem fecha ~R$ 5.000/mês com contrato (`premiumEmpata()` calcula isso,
não é número escrito à mão). **A tela de assinatura diz quando NÃO vale** —
abaixo desse volume a conta de R$ 89 sai mais barata, e esconder isso seria o
tipo de venda que faz desconfiar do resto do produto.

As três funções (`PREMIUM_PROD`):
- **Cláusulas próprias** (`CLAUSULAS`, `CLAUSULAS_MODELO`): NDA, cessão de
  direitos, confidencialidade. **Gravadas no job no fechamento**
  (`e.clausulas`), não lidas na hora de exibir — contrato que muda de texto
  depois de assinado não é contrato, e há teste para isso.
- **Relatório de custo** (`relatorioCusto()`, `csvCusto()`): custo por função
  com barra, e CSV com uma linha por pessoa por job. O botão **não baixa** — o
  visualizador de artifact bloqueia download iniciado pela página, então a tela
  diz isso em vez de fingir.
- **Escala recorrente** (`abrirRepetir`): repete a escala a cada 1/2/4 semanas.
  Cada job novo nasce **sem assinatura e sem sinal** — contrato de um não vale
  para o outro.

O botão "Repetir escala" aparece para todo contratante e abre o Premium se ele
não assinou — mesma lógica de vitrine trancada de "Montar equipe" para o freela:
mostra o que ele ganharia em vez de esconder que existe.

**Não entrou** (sugeri, Victor não escolheu): contas para a equipe de produção
(vários logins na mesma produtora). É o upsell mais óbvio de B2B e continua
disponível se ele quiser depois.

**Ainda em aberto** (não bloqueia nada, mas vale decidir com o Victor):
1. `c.gar`/`c.exige` continuam como estavam. Com o adiantado caindo de 106%
   para 26%, talvez quase todo mundo aceite — vale perguntar se o freela ainda
   escolhe entre três níveis ou se isso vira padrão.
2. O toggle mestre (`fe-toggle`/`garEscOn`) continua existindo e ainda faz
   sentido (deixa negociar acerto direto com quem aceita mas não exige), mas a
   razão econômica de desligá-lo ficou bem mais fraca.
3. Os 20%/6% são chute de mercado do Victor, não validado com contratante
   nenhum ainda.
4. O duplo check acrescenta fricção por pessoa. Se for chato de usar, é
   exatamente o que empurra gente de volta pro WhatsApp.

### Cancelar e editar o job

Job cai, freela adoece, job cresce. A tabela de cancelamento já era decisão
de produto desde a custódia — o que faltava era a tela.

| Quem cancela | Quando | O que acontece |
|---|---|---|
| Contratante | +7 dias | devolução integral |
| Contratante | 3 a 7 dias | 50% fica com quem estava escalado |
| Contratante | menos de 72h | 100% fica com quem estava escalado |
| Freela | qualquer momento | devolve tudo, e o cancelamento entra no perfil |

A assimetria é deliberada. Quem contrata cancela em cima da hora e o valor fica
com o freela, porque ele já recusou outro job naquela data — é a única proteção
real contra data furada. O freela não paga multa em dinheiro: paga com o **fato
de operação** que quem contrata lê antes de chamar de novo, e num mercado onde
todo mundo se conhece isso custa mais que taxa.

**Editar a escala é só do contratante** (`editandoJob`): substituir alguém,
acrescentar e tirar. O select do substituto só oferece quem está **livre naquela
data**, e quem já ocupa a vaga aparece como "· na escala" — rotulá-lo "não está
livre" era um artefato da simulação, porque ele está ocupado justamente com este
job. O bloco mostra o custo antes e depois, com a diferença.

**Aberto:** Victor disse que cancelar "pode pagar taxas" dos dois lados. Do lado
do contratante isso está implementado. Do lado do freela hoje o custo é
reputacional, não monetário — se ele quiser uma taxa em dinheiro ali, é regra
nova e precisa do número.

### Busca por nome + filtro garantia/acerto direto

Dois pedidos juntos: achar um freela específico pelo nome, e deixar o
contratante escolher de saída quem trabalha com garantia e quem faz acerto
direto — útil justamente por causa da seção anterior (nem todo mundo exige
depósito, então vale filtrar por isso antes de montar a escala).

- `#f-nome`: campo de texto simples, filtra por `titulo(c.nome)` case-
  insensitive, com `S.lim=PAGINA` resetado a cada busca.
- `#f-pagto`: substituiu o antigo checkbox `#f-gar` (que só cobria metade do
  problema — só "aceita garantia", sem separar de "acerto direto"). Vira um
  `.segm` de 3 botões (Todos/Garantia/Direto), `aria-pressed` marca o ativo.
  Rótulo é "Direto", não "Acerto direto" — o texto completo cortava (`…`) nos
  238px do painel lateral; a forma longa continua nos badges e na tela de
  Fechar escala, onde há mais espaço.
- `filtrar()` ganhou `S.pagto==="gar"` (só `c.gar`) e `S.pagto==="direto"` (só
  `!c.gar`) — mutuamente exclusivos e cobrem 100% dos 109 cadastros, porque
  `c.gar` é booleano em todo mundo.
- **Pegadinha de teste**: `#rows .row` não é `filtrar().length` — a tela pagina
  (`PAGINA=30`, corte por `S.lim`) e ainda desenha "Meu time" à parte, sem
  cortar. Para comparar contagens de filtro, avalie `filtrar()` direto via
  `page.evaluate`, não conte linhas do DOM.

### Meu time

A estrela na busca não é só marcador: ela alimenta o painel **Meu time** na tela
de escalar. Quem contrata volta a chamar as mesmas pessoas, e a pergunta ao
montar escala é sempre "meu pessoal tá livre nesse dia?".

- Agrupa por **`c.principal`** (as funções principais), **não** por `c.func`.
  Quem marcou dez funções no cadastro apareceria dez vezes e a tela que era para
  responder rápido viraria uma segunda busca. Com `principal`, 5 favoritos dão
  ~10 linhas em ~7 grupos.
- Mostra o estado na **data do databar** (`S.dia`), e repinta quando a data ou a
  praça mudam.
- Quem está livre entra na escala com um clique, já na função do grupo. Quem
  está ocupado aparece assim mesmo — saber que o preferido não pode também é
  resposta.
- `FAV` nasce com cinco pessoas escolhidas por **função principal distinta**. Se
  fossem escolhidas por `c.func`, cairiam cinco operadores de câmera que também
  fazem drone e o agrupamento não mostraria nada.
- O painel só existe para contratante assinante — é `podeVerAgenda()` de novo.

### Catálogos — ninguém digita

`FUNCOES` (19, vem do `crew.json`) e `TIPOS` (15, no template) são as duas
listas fechadas. Usadas em cadastro, portfólio, consulta e job. Já houve **quatro
grafias diferentes** de tipo de trabalho no mesmo produto; se aparecer um `input`
de texto para função ou tipo, é regressão.

O `crew.json` tem dado sujo do formulário original e é **normalizado no
carregamento** (`normalizarTipo`, `DE_PARA_TIPO`): caixa alta vira capitalização
normal, `"CASAMENTOS E EVENTOS"` e `"CASAMENTOS e eventos"` viram um só, e
`"Todos os nichos"` (73 das 109 pessoas) vira a marca `todosTipos`, mostrada
como "Atende qualquer tipo" em vez de virar chip solto.

### Paleta — a escada de cinza

Os três níveis de texto existem para hierarquia e **todos passam 4.5:1** nos dois
temas. Não introduza um quarto nível nem uma cor literal fora dos tokens.

| Token | Escuro | Claro | Para quê |
|---|---|---|---|
| `--cal` | `#E9EEF0` | `#12181D` | texto principal |
| `--cal-fraco` | `#AEB9C0` | `#48545C` | secundário, descrições |
| `--cal-tenue` | `#8C979E` | `#5C6870` | rótulos mono, notas |

A escada foi subida de uma vez: `--cal-tenue` estava em `#67727A` (3.18–3.82) e
`--cal-fraco` em `#93A0A8`. Subir só o tenue teria encostado ele no fraco e
achatado a hierarquia — por isso os dois andaram juntos. Os degraus hoje são
1.78× e 1.57× de luminância, contra 2.48× e 2.09× antes: mais apertado, ainda
distinguível, e legível.

Duas outras correções vieram junto: `.bg` (o badge de contagem) e `.btn.mg`
usavam `#fff` sobre magenta, o que dava 3.29. Agora usam `var(--grafite)`, que
resolve nos dois temas sozinho — no escuro vira texto quase preto sobre rosa
(5.72), no claro vira quase branco sobre magenta escuro (6.33). **Cor literal em
cima de token é o defeito**: `#fff` não sabe em que tema está.

### Vocabulário

**"contratante", nunca "produtora"** como nome do papel — *"tem muito freela que
pega trabalho também, mas não é produtora"*. Sobrou "produtora" só onde é
legítimo: nome de empresa ("Produtora Maré"), tipo de negócio no dropdown ao lado
de Agência/Marca/Veículo, e placeholders que dão exemplos.

Identificadores internos (`v-produtora`, `PRODUTORAS`, `abrirProdutora`) **não**
foram renomeados de propósito: churn com risco e zero ganho para quem usa.

---

## 23/ago — o reset nº 4, e o que se aprendeu com ele

### O container reseta. O artifact salva a página; o repositório salva o resto.

Quarto reset em dois dias. Este levou `src/template.html`, `src/build.js`, as
14 suítes novas, os consertos nas outras, o CLAUDE.md inteiro do dia,
`docs/registro-supabase.html` e `public/og.jpg`.

**O produto voltou do artifact publicado, byte a byte.** O método:

```
1. Artifact action:"read"  → o HTML completo cai num arquivo local
2. corta em <title>        → é onde public/artifact.html começa
3. desfaz as substituições do build, na ordem inversa:
     fontes → /*__FONTS__*/      frames → /*__FRAMES__*/
     brechó → /*__BRECHO_FOTOS__*/{}
     crew   → /*__CREW__*/       funções → /*__FUNCOES__*/
4. `node src/build.js` e `cmp` contra o corpo extraído — tem que bater
```

⚠️ **Os marcadores só se desfazem se as fontes locais forem as mesmas.** Aqui
`crew.json` tinha sido revertido junto e não casava — foi assim que o problema
grave apareceu (abaixo). Quando um marcador não casa, **não force**: extraia o
bloco do próprio artifact.

⚠️ **`src/build.js` não está no artifact**, porque ele monta o `<head>` que o
artifact não tem. Voltou sem as tags do cartão de link — e esse defeito é
invisível de dentro. Quem pegou foi `test/cartao-do-link.js`.

**O que o artifact NÃO salva: as suítes, os docs, o CLAUDE.md.** Por isso o
fonte agora vive em `victorbarrosoc-hub/carrodofreela-app` (privado), em `app/`,
com os arquivos de deploy intactos na raiz para a Vercel não notar diferença.

### ⚠️ O reset devolveu a LISTA REAL por cima da fictícia

`src/crew.json` voltou com os **109 nomes de verdade** — em minúscula, do jeito
que veio do cadastro original. Reverteu junto o CLAUDE.md e
`docs/ligar-dominio.html`, que citavam uma pessoa real como exemplo.

**Nada saiu daqui**: a última publicação foi antes do reset, com a lista
fictícia, e o artifact no ar foi conferido (`Paula Santos`). Telefone não estava
no arquivo. Mas por alguns minutos o `public/index.html` local teve nome real
dentro, porque eu reconstruí o build antes de perceber.

Três coisas mudaram por causa disso:

1. A lista real vive só em `src/crew.local.json`, e o `.gitignore` do repositório
   segura o nome do arquivo **em dois caminhos**. ⚠️ **Desde 13/set o arquivo
   não existe mais em lugar nenhum** — ver o alerta no topo deste guia. As duas
   linhas do `.gitignore` ficam onde estão: elas são o que impede a lista de
   voltar a entrar se alguém um dia repuser o cofre.
2. `test/sem-nome-real.js` ganhou uma asserção nova: **`src/crew.json` tem que
   SER a lista fictícia**, comparando registro a registro com a local. Não basta
   não ter nome real espalhado pelo repositório — o seed em si já foi trocado.
3. Ela agora **roda de verdade** (a lista local existe) e achou quatro
   vazamentos na primeira execução, incluindo o que o próprio comentário dela
   descrevia: uma fixture de contrato de locação atribuindo a uma pessoa real um
   empréstimo que nunca existiu.

⚠️ **E ela pegou este próprio texto.** A primeira versão desta seção citava o
nome real como exemplo do que tinha voltado — documentar o vazamento citando o
nome **é** o vazamento, e foi exatamente assim que a limpeza de 21/ago falhou
pela metade. Ao escrever sobre dado real, descreva a FORMA ("em minúscula, como
veio do cadastro"), nunca o dado.

**Era o argumento mais forte para fechar o repositório público** — ele tinha a
mesma lista, e o reset mostrou que ela reaparece sozinha. **Victor resolveu em
24/ago.** O que continua valendo é o resto: o reset devolve a lista real por
cima da fictícia, e quem segura é o `.gitignore` em dois caminhos mais o
`sem-nome-real.js`. Depois de todo reset, conferir `src/crew.json` ANTES de
qualquer build.

### `addInitScript` é da PÁGINA — e eu errei isso duas vezes no mesmo dia

Reaplicando o preâmbulo nas 44 suítes, o script só preparou a **primeira**
página de cada arquivo. Treze suítes criam uma segunda para medir o celular, e
essas estouravam em 30s num seletor sem relação com o problema.

É o mesmo erro que já tinha aparecido em `premium-contratante`, onde o preâmbulo
morava dentro de um helper que o primeiro bloco não usava. A regra: **toda
variável de página que faz `goto` precisa do seu `addInitScript`.**

### Dois defeitos de produto achados escrevendo teste

1. **A tabela de diária não sobrevivia ao recarregar.** `PRECOS` não estava em
   `DEPOSITOS`. A pessoa preenchia as 19 funções, recarregava, e voltava tudo
   ao valor semeado — justamente o dado que o produto mais pede, com um gancho
   inteiro na caixa de propostas convidando a publicar. Achado por
   `persistencia.js`.
2. **A descrição do cartão de link dava três linhas**, e o WhatsApp mostra duas.
   86 caracteres; a última palavra caía numa linha que ninguém lê. Medido em
   navegador — contar caractere não resolve, porque o que decide é onde as
   palavras quebram.

---

## 23/ago — "muita coisa pra ler", medido

Victor trouxe o retorno do testador. Antes de opinar, medi — e o número
derrubou a solução óbvia.

### O texto é 3% a 13% da altura. Cortar texto não resolve.

| Tela | Altura | Prosa |
|---|---|---|
| Meu perfil | **7,9 telas de iPhone** | 10% |
| Brechó | 4,7 telas | 3% |
| Orçamento | 4,5 telas | 13% |
| Meus jobs | 4,1 telas | 8% |

Apagar **toda** a prosa de "Meu perfil" tirava 616px de 6.467 — de 7,9 para 7,2
telas. E o Brechó, que quase não tem texto, tinha 4,7 telas.

**O que pesa não é quantas palavras, é quanto chega de uma vez.**

### 1. "Meu perfil" virou sanfona — 7,9 → 1,7 telas

A medição por bloco: a **tabela de diária sozinha tinha 2.445px** (19 funções ×
2 colunas), e o portfólio outros 2.100px. Tudo aberto ao mesmo tempo.

⚠️ **Fechado não é escondido, e a diferença é a cabeça do bloco.** Cada uma diz
o que tem dentro ("4 trabalhos", "tabela não publicada") — a página fechada é o
**mapa** do perfil numa tela. Cabeça sem resumo seria esconder. E aberto o
resumo sai, porque viraria eco do que está logo abaixo.

⚠️ **Isto não é o explicador.** Lá a regra é "nada some no meio do uso". Aqui
ninguém some: abrir a tela é o começo, e o estado inicial de um bloco não é uma
retirada. O que a pessoa abre **fica** aberto (`PF_ABERTOS`).

⚠️ **Feito em tempo de execução, de propósito.** Envolver 250 linhas de markup à
mão para criar seis wrappers seria arriscar o layout por uma mudança de
comportamento — e este arquivo já tem a cicatriz de um `</div>` a mais.

Três correções durante a construção:

- **O medidor e o "Completar cadastro" caíram dentro de um bloco fechado.** É o
  botão de que a porta curta inteira depende — o cadastro foi encurtado com a
  promessa de que o resto se completa *ali*. Promessa atrás de uma seta fechada
  não é promessa. Eles sobem para o topo.
- **Margem inline vence classe**: duas cabeças tinham `style="margin-top:44px"`
  de quando eram títulos soltos, e isso virava um vão vazio entre duas linhas de
  índice.
- Duas suítes dependiam da página aberta e passaram a abrir o bloco — que é o
  que a pessoa faz.

### 2. O brechó em duas colunas — 4,7 → 2,3 telas

`minmax(168px,1fr)` **não cabia duas vezes a 390px por três pixels**: sobram
346px úteis, e 2×168 + 13 de gap dá 349. Nove categorias de 158px empilhadas.

⚠️ **Só a altura mínima, nunca o padding.** Mexi nos dois primeiro e o preço
apareceu cortado: `.catfoto` sobe até a borda com margem negativa casada com o
padding padrão, e o `overflow:hidden` come o que sobra embaixo.

### 3. As notas recolhem junto com o explicador — 13% → 23%

O mecanismo do "?" cobria **um quinto** da prosa: 1.680 palavras nas quinze
telas, 13% recolhendo. O resto mora em `.note`, e em "Meus jobs", "Orçamento" e
"Meu perfil" o corte era **zero**.

⚠️ **Nem toda nota pode recolher**, e a classificação é **derivada**, não uma
lista à mão que envelhece na primeira nota nova:

| Tipo | Exemplo | Regra |
|---|---|---|
| **regra** | "Cada função tem o próprio contrato e libera sozinha." | recolhe |
| **estado** | "Sua taxa por job é de 4%..." | tem número → fica |
| **vazio** | "Nenhuma vaga ainda." | começa com Nenhum/Sem → fica |
| **ação** | nota com botão dentro | fica |

⚠️ **Um "?" por bloco, não por frase.** Seis notas numa tela virariam seis
interrogações soltas — troca de ruído por ruído. As notas de regra de uma tela
recolhem **juntas**, no mesmo botão do explicador do topo.

### A ferramenta de medir também mente

O script de densidade conta só elementos-folha, então **parágrafo com `<strong>`
dentro não é contado** — e o explicador de várias telas tem. Os números acima
são direcionais, não exatos. O que vale é a asserção em `test/densidade.js`, que
mede o comportamento no DOM em vez de contar palavras.

---

## 23/ago — o autocompletar chega onde a pessoa DECLARA (e o reset nº 5)

### O reset nº 5, e a prova de que o repositório funciona

Uptime de 6 minutos, template de 20/08, testes sumidos, `crew.json` **de novo
com a lista real**. Diferença desta vez: `git clone` do `carrodofreela-app` +
`tar` de `app/` sobre a árvore, e **tudo voltou em dois minutos** — contra uma
sessão inteira nos resets anteriores. A rotina de recuperação:

```
1. cp src/crew.json src/crew.local.json      # contém a lista real que voltou
2. git clone --depth 1 …/carrodofreela-app
3. tar -C app -cf - . | tar -C <projeto> -xf -   # não toca no crew.local.json
4. node src/build.js && bateria
```

E o Victor subiu o índex aprovado na RAIZ do mesmo repositório ("Add files via
upload") — o deploy da Vercel sai dali, então raiz = o que está no ar.

### O autocompletar nos campos de declarar equipamento

Victor, com o exemplo exato: *"qual equipamento vc tem: ele preenchesse sozinho
com a sugestão… A7… aí completasse com a sugestão: A7IV ou A7III."*

O mecanismo existia (22/ago) **só no inventário e no anúncio** — os campos onde
a pessoa declara o que tem continuavam digitação livre. Agora:

| Campo | Modo |
|---|---|
| `pf-cam-novo` (Meu perfil · corpos) | só câmera · **escolher já vira chip** |
| `pf-len-novo` (lentes) | só lente · idem |
| `cd-cam` / `cd-lentes` (cadastro) | **fragmento**: completa só o pedaço após a última vírgula/barra |
| `iv-nome` / `nv-titulo` | como antes, com preço de tabela |

`ligarSugestao` ganhou opções (`cats`, `fragmento`, `semPreco`, `aoEscolher`) e
continua aceitando a função antiga. Decisões:

- **Escolher JÁ adiciona o chip.** Segundo toque no "Adicionar" devolveria
  metade do atrito que a sugestão tirou. O botão continua lá para equipamento
  que o catálogo não conhece.
- **Sem preço no perfil e no cadastro** — ali a pessoa declara o que TEM;
  preço seria a plataforma avaliando o equipamento dela sem ninguém pedir.
- **Sem a etiqueta de categoria em campo filtrado** — "Câmera" quatro vezes só
  ecoaria o rótulo do campo.
- **Fragmento preserva o que já está escrito**: "Sony FX3, a7s" → escolher →
  "Sony FX3, Sony A7S III". Apagar a linha para pôr a escolha seria pior que
  não sugerir.
- ⚠️ **Campo preenchido por código não dispara `input`** — e o cadastro salva
  `EU.cam` justamente ali. `ligarSugestao` passou a disparar o evento na
  escolha; sem isso a pessoa via o valor na tela e o perfil nunca recebia.
- O nome que entra é o **canônico do catálogo** ("Sony A7 IV") — é o que faz
  "quem tem A7 IV" achar na busca por equipamento.

Catálogo ganhou 4 corpos comuns da praça: FX6, ZV-E10, A7C II, RF 24-70.

**Fora de escopo, com razão anotada:** sugerir no `f-gear` (o FILTRO de busca).
O filtro varre o texto livre que cada um escreveu no perfil — sugerir o nome
canônico ali pode DEVOLVER MENOS que digitar "a7", porque quem escreveu "A7III"
não casa com "Sony A7 III". Só passa a valer quando a base convergir para os
nomes do catálogo, o que este autocompletar começa a fazer.

---

## 23/ago — o comparativo FreelaAV (e o reset nº 6, NO MEIO da sessão)

### O reset nº 6 mudou o que a checagem de início precisa olhar

Este resetou **entre dois turnos da mesma conversa** — a máquina nasceu de
novo enquanto a sessão continuava. E a checagem de início de sessão tinha
passado limpa no turno anterior, porque os marcadores usados até aqui
(`crew.json` fictício, `crew.local.json` existindo) **também existem no
snapshot** quando o snapshot é recente o bastante. Desta vez o snapshot era
de ~21/08: crew real de volta, `crew.local.json` sumido, e — o sinal que
denunciou — **a lista de suítes sem as da última leva**.

⚠️ **Marcadores confiáveis de reset, nesta ordem:**
1. `ls test/*.js | wc -l` contra o número da última leva (hoje, 19/out · 2:
   **87 arquivos** — 86 suítes contando `_servir.js`, + `run.js`; o runner roda
   todo `.js` que não seja `run.js`);
2. o arquivo mais novo da leva anterior existir (hoje:
   `test/seguranca.js` e `test/fase1-sem-dinheiro.js`, `src/seguranca.js` e
   `src/blindar.js`, e antes deles `test/cadastro-foco.js`, `test/abertura-solta.js` e `test/entrar.js`; `src/assets/heroes.json` (9 chaves) e
   `src/assets/home-video.json` EXISTINDO com `mp4`, `poster`, `parado` e
   `cenas` (5) e **SEM `intro`** (18/out · 3), e `src/midia/` com **98
   arquivos** (49 leves + 49 `@hd`, sem `home-intro`); `src/assets/login-video.json`
   EXISTINDO, com `mp4` e `poster`; `src/assets/home3d.json`
   EXISTINDO com 21 objetos (as chaves `cofre` e `megafone` entre eles); e
   `src/assets/fotos.json` SEM as chaves `hero` e `recorte`);
3. `uptime` MENOR que o intervalo desde o último comando — pega reset no
   meio da sessão, que foi o caso.

O crew fictício NÃO é marcador: ele diz que o snapshot é pós-contenção, não
que a árvore está atual. A rotina de recuperação continua a mesma do nº 5 e
levou os mesmos dois minutos.

### O comparativo com a FreelaAV — `docs/comparativo-freelaav.html`

Um anúncio de "freelaoav.com" chegou ao Victor; a plataforma real é a
**FreelaAV** (freelaav.com.br) — hub nacional de freelas de audiovisual de
EVENTOS (som, luz, vídeo, produção de palco). Ele pediu análise e depois o
comparativo formal, para uso no pitch.

- **Só fonte pública, e o documento diz isso**: o ambiente bloqueia o site
  (egress), então tudo veio de material indexado, com data. O que a FreelaAV
  não publica está marcado *"não publicado"* — **nunca deduzido**, mesma
  regra da diária.
- A diferença central que o documento sustenta: **eles REGISTRAM a dívida
  (painel de contas a receber, pagamento fora); o Carro põe o sinal em
  custódia ANTES do job e libera na conferência.** Registro × proteção.
- Entrada `freelaav` na tabela do `docs/gerar-pdf.js`. **Duas folhas**,
  frente e verso.
- ⚠️ **`html{font-size}` no print NÃO encolhe o corpo**: `body` tem 15.5px
  em px, que não obedece. O bloco print precisa de `body{font-size:9.6pt}`
  próprio — sem isso saíam 3 folhas com a terceira quase vazia. Vale para
  qualquer doc novo da família.

---

## 23/ago — a Sirene e o Cofre

Batch do Victor com duas peças novas e uma afirmação de estratégia: *"Penso
na estratégia do Uber e da JET: focaram em um local primeiro, fizeram nome e
força lá e depois foram expandindo, conquistando território que nem o jogo
WAR."* — que é a tese que o PRD e a folha do sócio já carregam (*"o negócio
não está na primeira cidade, está em repetir a primeira cidade"*). As duas
peças entram como ferramentas dela: a Sirene fecha vaga em minutos (densidade
respondendo), o Cofre dá motivo de abrir o app em dia sem job (hábito).
E ele deu o norte de produto por escrito: *"o diferencial da plataforma é a
ilustração, layout, animações, sons, intuitivo — isso deixa tudo mais leve"*.

### A régua Bitrix24 (23/ago, direção do Victor)

*"Você vai encontrar tudo que precisa da área, mas tem que pagar por isso…
Minha preocupação é ficar confuso demais."* O Bitrix24 é a referência do
MODELO (freemium por degrau, tudo num lugar) e o contra-exemplo da TELA
(horizontal, genérico, famoso por confundir). A régua que fica:

- **Completude VERTICAL**: peça nova só entra falando o vocabulário do set.
  "Tudo" = o dia do freela e do contratante, nunca ferramenta genérica.
- **Tranca é VITRINE, não parede**: toda função paga mostra o que faz, o
  degrau e o preço — pagar é abrir, não descobrir. (Varredura formal disso
  proposta e aguardando aval.)
- **Mostrar tudo, apresentar pouco por vez**: explicador que recolhe, mapa
  em grupos, sanfona, guia — o padrão que ele aprovou por escrito ("a ideia
  das abas resolve muito"). Tela nova nasce dentro desse sistema.
- Fila sugerida: varredura toda-tranca-é-vitrine · varredura de primeira
  impressão nas telas que restam · busca no mapa quando passar de ~30 telas.

### A Sirene — procura de gente para JÁ (`sirene.js`, 32)

*"Aparece pra todos os freelas selecionados que nem chamada de Uber no app,
jeito fácil pro freela aceitar ou recusar."* Toggle em Passar o carro
(`#u-sirene`); no freela a chamada TOMA A TELA (`#sirena`, prefixo `sr-`).

**As três regras que seguram o desenho:**
1. **A sirene NÃO muda o contrato.** É a MESMA corrida (primeiro que aceitar
   leva) e a MESMA proposta na caixa — aceitar passa por `aceitar()`/`viraJob`
   de sempre. Urgência é interface, não um tipo novo de job.
2. **Ninguém fica preso.** "Decidir com calma" fecha a tela e a chamada segue
   NOVA na caixa. Recusa rápida existe em três formas: dois chips com os
   motivos de `MOTIVOS` e o recusar seco (motivo "recusou pela sirene").
3. **Expirar mata a URGÊNCIA, não a chamada** — aviso diz onde ela continua.
   A contagem é DERIVADA de `prop.ate` (timestamp na proposta): fechar e
   reabrir não zera relógio de ninguém.

Decisões de forma:
- **Não é `.ovl` de propósito**: modal empilha e espera calma; isto substitui
  a tela — `z-index:98`, acima de avisos (95) e suporte (96/97).
- **`som("sirene")` é a buzina impaciente**: a mesma terça 440/554 alternando
  rápido — urgência de carro, nunca de viatura. O SOM é um ciclo curto como
  toda a paleta; o LOOP é de quem abre (`setInterval` em `abrirSirene`,
  morto em `fecharSirene`). `chamadaChegou` com sirene NÃO dispara `avisar`:
  a tela é o aviso, dobrar seria gritar duas vezes.
- Com sirene os simulados respondem mais rápido (1000+k·450 vs 2600+k·1100) —
  é o que a urgência compra, e `pintarChamada` diz "Sirene ligada".
- Demo: `#pp-sir` ao lado do `#pp-sim`, mesmo padrão (contratante fictício,
  banner na tela). `simularChamada(sim,extra)` ganhou o `extra`.
- `prefers-reduced-motion`: pulso desliga, contagem numérica fica.

⚠️ **Passar o carro é tela do Volante** — a suíte destranca com a sequência
de `chamada.js`: `abrirAssinatura()` → `#as-ok` → `#as-f`. Sem isso o
`#u-send` fica invisível e o clique estoura em timeout mudo.

### O Cofre — painel financeiro dos dois lados (`cofre.js`, 38)

*"O que o contratante falta pagar, prazos, pra quem, o que foi com sinal, o
que foi direto… gráficos, metas por projeto escritas pelo usuário, cofre
organizacional — NADA de dinheiro dentro da plataforma, é um jeito de
organizar só."* View `v-cofre`, menu grupo **Você**, nos DOIS modos
(prefixo `cof-`; `cf-` já era prefixo de chave de localStorage).

**A regra que segura tudo: O COFRE NÃO TEM CONTA PRÓPRIA.** Cada número é
derivado das fontes que as telas de sempre leem — `JOBS`/`garStatus`/
`recebido` (freela), `PAGOS`/`ESCALAS`/`faseVaga`/`depositado` (contratante).
A suíte REFAZ cada conta pelas primitivas e compara com o pintado; se o
Cofre discordar da agenda ou de Vendas, é bug do Cofre.

- **Três painéis** (`.segm`): Visão (4 medidores + gráfico de 8 semanas),
  A receber/**A pagar** (o rótulo muda com o MODO), Metas e cofre.
- **A pagar é por PESSOA, não por job** — é por função que o dinheiro anda
  (`cofVagasProd`): fase, prazo, quanto falta; vaga entregue cobra **"falta
  VOCÊ conferir"**. Acerto direto sai como **"por fora — o Cofre lembra,
  não cobra"**; entrega antiga sem pagamento aparece VENCIDA em magenta.
- **`METAS`/`GUARDAS` são a exceção declarada**: dado escrito PELA pessoa
  ("guardei X na poupança, para a meta Y"). A plataforma soma e lembra;
  nunca inventa, nunca movimenta. Persistem via `DEPOSITOS`+`usoGravar()`
  chamado na mutação. **Apagar a meta NÃO apaga as guardas** — o registro
  fica órfão (`meta:null`): dinheiro guardado não some com a meta.
- **"Nada de dinheiro dentro do Cofre" é linha REGULATÓRIA**, escrita em
  `.limite`: cofre que recebesse valor seria conta de pagamento (a mesma
  régua do "take nasce de recebimento"). Organização, nunca custódia.
- **Gráfico**: 8 semanas, barras `--d1` (paleta de DADO, nunca acento),
  sobem com stagger e `som("moeda")` UMA vez por visita — gráfico não é
  caça-níquel. Medidores com `contar()`. Meta usa `--d5`; bater a meta
  vira frase ("meta batida ✓"), barra para no 100.
- **Acento único**: só "Registrar" é sólido; "Criar meta" é fantasma (dois
  sólidos no mesmo painel era o defeito que a casa já corrigiu duas vezes).
- Banner de demonstração (números saem dos jobs fictícios) + explicador
  `data-exp="cofre"`.

**Aberto, para decidir com o Victor:**
1. Cofre é grátis dos dois lados por ora — ele não pediu tranca; se um dia
   entrar em plano, entra pela escada (`temNivel`), nunca por `ASSINANTE`.
2. Sirene não custa a mais (mesma taxa do job) — validar se vira diferencial
   de plano ou fica universal.
3. Link carteira→Cofre não construído (a porta é o menu); se sentir falta,
   é um `linkc` em Vendas/custódia.

---

## 23/ago — a régua Bitrix vira código: vitrines auditadas e a mini-estrada

Victor deu o aval das varreduras e a licença: *"não se prenda muito ao
padrão da casa, pode abrir ideia criativa que fique mais ilustrativo e de
fácil entendimento."*

### Varredura 1 — toda tranca é vitrine (`vitrines.js`, 45)

A régua executável: cada função paga precisa dizer (1) O QUE faz, (2) o
DEGRAU pelo nome certo com PREÇO, (3) ter PORTA que abre a assinatura
certa, (4) carregar a mini-estrada. A auditoria passou por: busca, agenda
de perfil, Passar o carro, Montar equipe (cmp), orçamento, relatório do
ano (Premium), cláusulas e relatório de custo (Frota), repetir escala.

**Dois defeitos reais achados e corrigidos:** as vitrines de Cláusulas e
Relatório de custo vendiam a Frota no texto e o BOTÃO dizia **"Ver o
Premium"** — nome que hoje é o plano de FREELA de R$ 19 (o mesmo erro de
nome corrigido nos textos em 19/ago, sobrevivendo no rótulo do botão). E
nenhuma das duas mostrava preço. Agora: *"Ver a Frota — R$ 189/mês"*. A
suíte jura que a frase "Ver o Premium" **não existe** no documento e que
**nenhuma `.trancado` renderiza sem "R$"**.

### A mini-estrada (`viaMini(alvo)`, `.viamini`) — a criativa autorizada

Toda vitrine ganhou O MAPA: cinco pontos (Grátis → Premium → Estrada →
Volante → Frota), o degrau da pessoa marcado ("você"), o degrau da função
aceso em ciano com o nome. É a resposta ilustrada à pergunta única de toda
tranca — *"quão longe estou disso?"* — e o antídoto-Bitrix: função paga
sempre se apresenta com o endereço na escada.

- **Sem carro, de propósito**: o carro é a assinatura do botão da casa e o
  indicador de posição em Planos ("dois carros, dois trabalhos"). Isto é
  placa de estrada, estática.
- **Só dois rótulos** (alvo + "você"): cinco nomes num trilho de 340px
  seria poluição.
- `role="img"` com aria-label dizendo os dois degraus por extenso.
- ⚠️ **O círculo é `::before` DE PROPÓSITO.** Na primeira versão o `<i>`
  tinha o background e o rótulo era filho absoluto dele: a auditoria de
  contraste leu "Frota" ciano contra o PONTO ciano (razão 1) e reprovou —
  com razão, a heurística dela sobe a árvore até achar fundo. Elemento com
  texto posicionado para FORA de si não pode ser o dono do fundo.
- Entra por `viaMini(NIVEL.X)` nos DOIS construtores (`painelTrancado`,
  `painelTrancadoFreela`) e nas três vitrines de bloco (relatório freela,
  cláusulas, relatório de custo). Vitrine nova chama `viaMini` — a suíte
  cobra o `.alvo` certo em cada uma.

### Varredura 2 — primeira impressão medida (390px, 1ª visita)

Prosa na primeira dobra, medida antes de mexer: pracas 16 · propostas 26 ·
agenda 16 · buscar 20 · equipe 13 · passar 38* · jobs 16 · orcar 42* ·
guildas **43** · brecho 19 · meu 19 · minhaprod 19 · aprender 21 · planos
32* · cofre 23 · feed 13 (%; * = vitrine/venda aberta no chapéu medido —
ali o texto É o argumento e não se trata).

**Só Guildas era confusão de verdade**: quatro blocos de prosa empilhados
e NENHUMA guilda na primeira dobra — a tela "Quem roda junto" abria sem
ninguém rodando. Cirurgia de três cortes, sem perder informação: o aviso
demo de 3 linhas → 1,5 (a suíte `guilda-social` segue achando
"demonstração"); o parágrafo do "sem guilda" repetia o explicador →
virou a linha de ação; o argumento "guilda descartável" saía DUAS vezes →
ficou só no modal de fundação, onde a decisão acontece. O ranking entrou
na primeira dobra. `guildas` 60/60 e `guilda-social` verdes depois.

**Fica anotado**: busca no mapa de telas quando o produto passar de ~30
telas (hoje não precisa).

---

## 23/ago — identidade por área: "onde eu estou?"

Victor: *"às vezes eu tenho a impressão que as telas são muito parecidas e
acaba confundindo onde a pessoa está."* **Ele estava certo, e a causa eram
duas regras BOAS da casa**: acento único (só ciano em ação) e mono só em
número tiraram quase tudo que diferenciava uma tela da outra. Sobrou a mesma
anatomia em todas — rotulinho cinza, título grande, parágrafo — e o
rotulinho ainda REPETIA: "Sua área" em Propostas, Agenda, Jobs, Meu perfil e
Minha produtora; "Sua conta" em Planos e Cofre; "Para quem contrata" em
Montar equipe e Orçamento.

**Medido antes de opinar**: uma tira com seis cabeçalhos empilhados a 390px.
Três telas seguidas diziam a mesma palavra no topo — que é justamente onde a
pessoa olha para se localizar.

Ele escolheu a opção mais visível das três (glifo + cor + véu), com a
licença: *"não se prenda muito ao padrão da casa, pode abrir ideia criativa."*

⚠️ **Desde 17/out · 14 o rótulo não aparece mais** (Victor: *"cara de IA"*): quem diz onde você está é o título, que não se repete, e o cartão de cinema com a cor da área. O que segue é o desenho de 23/ago.

### As três camadas

1. **RÓTULO ÚNICO.** Nenhuma tela repete o rótulo de outra — é ele que
   responde "onde estou". Agenda "Sua semana", Propostas "Sua caixa", Jobs
   "O dia do job"/"O dia da equipe", Meu perfil "Seu portfólio", Minha
   produtora "Sua produtora", Planos "Sua assinatura", Cofre "Seu dinheiro",
   Montar equipe "A escala do job", Orçamento "A conta antes do job".
   A suíte reprova QUALQUER repetição nova.
2. **GLIFO derivado do MENU** (`AREA_ICO`, montado a partir de `MENU`).
   O ícone do cabeçalho é o MESMO desenho que a tela tem no menu e na barra
   de baixo — o botão que a pessoa tocou e a tela que abriu passam a ter a
   mesma cara. Ícone próprio aqui seria um segundo vocabulário para a mesma
   coisa. **Tela nova no MENU já nasce com o seu glifo**, sem código novo; a
   suíte compara traço por traço com `ICO_MP`.
3. **COR + VÉU por área**, quatro famílias: `trabalho` (praças, busca,
   propostas, agenda, equipe, passar, jobs, orçamento), `dinheiro` (cofre,
   planos), `equip` (brechó, anúncio), `turma` (feed, guildas, salão,
   perfis, aprender).

### ⚠️ As cores de área NÃO são cores novas

São a **paleta de DADO** (`--d1/--d2/--d3/--d5`) reusada. Ela já nasceu
dessaturada e **proibida em botão** — então identidade de área nunca compete
com o ciano de ação, e a regra do acento continua inteira. A suíte guarda
isso de dois jeitos: varre a folha de estilo atrás de regra que pinte
`.btn`/`button` com `var(--ar…)`, e varre os botões RENDERIZADOS de quatro
telas conferindo que nenhum fundo ou texto é cor de área.

### Decisões de implementação

- **O véu vive no `background` do próprio `.wrap`** (`linear-gradient` que
  some em 340px), e não num elemento novo: `position:relative` na `section`
  reancoraria filhos absolutos que hoje se apoiam em outro ancestral.
- **`montarGlifos()` embrulha só o PRIMEIRO `.lab`** (`.wrap > .lab`) num
  `.arcab`. Os outros `.lab` da tela são rótulos de CAMPO — embrulhar um
  deles quebraria o formulário. Há asserção contando `.arcab` × `.arcab .lab`.
- **O elemento embrulhado é preservado**, então `jb-rot`/`mp-rot`/`oc-lab`
  continuam podendo trocar de texto por JS (chapéu freela × contratante) sem
  perder o glifo.
- O glifo é `aria-hidden`: quem fala para o leitor de tela é o rótulo.
- Tokens de área existem nos DOIS temas com valores próprios (o bug clássico
  do artifact ilegível); a suíte compara claro × escuro e exige diferença.

`test/painel-do-job.js` lia `jb-rot === "Sua área"` e foi atualizado no mesmo
commit — mudança de rótulo quebra teste no seletor, e a correção é o teste,
nunca afrouxar a asserção.

### ⚠️ VITRINE SEM PORTA — o buraco que o Victor achou perguntando

*"E Montar equipe na aba de freela tá aonde?"* Resposta medida: **em lugar
nenhum, no celular.** A faixa de abas do topo (onde ela existia, com
`data-modo="ambos"`) **some abaixo de 820px**; a barra de baixo tinha
`data-modo="contratante"`; e o `MENU` da gaveta também era `contratante`.
No desktop a aba estava lá — no aparelho onde o freela vive, zero portas.
E doía mais que a Guilda em 19/ago, porque **Montar equipe é a vitrine que
VENDE o Volante**: a peça de venda estava invisível para o comprador.

Conserto: `["equipe","ambos",…]` no `MENU`. Não entrou na barra de baixo do
freela porque ela já tem os sete itens que cabem a 390px.

⚠️ **POR QUE O TESTE NÃO PEGOU, e é a lição que fica:** a suíte abria a tela
com `show('equipe')` — que **pula a porta**. Teste que navega por dentro
nunca vê porta faltando. `vitrines.js` ganhou um contexto de 390px que conta
portas VISÍVEIS (aba do topo + barra de baixo + gaveta) para cada tela que
vende, e cobra também a exceção decidida: **Passar o carro continua sem
porta no lado do freela de propósito** — ele não passa vaga, ele recebe a
chamada.

### ⚠️ O MAPA NÃO É O PRODUTO — o segundo buraco que o Victor achou olhando

*"Na fase 1 não era pra estar alugar equipamento."* Estava. `aplicarFase()`
tirava **"Alugar equipamento" do `MENU_BP`**, que é a lista da *gaveta*, e
`versoes.js` conferia exatamente isso — o mapa. Só que as abas de dentro da
tela do brechó (`[data-bp]`, markup fixo em `<div class="subabas">`) nunca
foram tocadas: a Fase 1 abria o Brechó com **"Alugar" e "Minhas vendas"** na
barra, as duas de Fase 2.

E não parava na barra. O aluguel voltava por mais três portas, todas dentro
do **inventário**, que É Fase 1:

* `#inv-cat` "Ver o catálogo de aluguel" e `#inv-sim` "Simular um pedido";
* **"Pôr para alugar"** em cada peça guardada;
* o fato **"Fora de casa · tudo com você"**, que só quer dizer algo com
  aluguel — e, do mesmo jeito, **"Dossiê 40% · falta número de série"** em
  cada peça, que é a conta do **seguro, Fase 5**.

Conserto em duas alturas, e a segunda é a que importa: portão nas subabas
dentro de `aplicarFase()`, **e portão dentro de `painelBrecho()`**. Só
esconder a aba não bastava — a carteira do topo, o item da gaveta, o painel
do job e o atalho do inventário chamam `painelBrecho("alugar"|"vender")`
direto, com o nome do painel na mão, e nenhum deles sabe de fase. É a mesma
regra do `aplicarModo()`: **onde a função escolhe, é lá que o portão mora.**

⚠️ **A lição, que é irmã da de cima:** ali o teste pulava a *porta*; aqui ele
conferia o *mapa*. Sumir do índice não é sumir do produto. `versoes.js`
passou a ler as subabas visíveis, a forçar `painelBrecho()` por atalho e a
varrer o **texto** do inventário atrás de "alug", "empresta", "fora de casa"
e "dossiê" — porque promessa não mora só em botão, mora em frase.

### O plano que falta se EXPLICA, não some (24/ago)

Victor: *"tem lugar que fala do plano, mas na versão que se encontra não
tem o plano."* O sistema de fases escondia os planos gated — e sobraram
três vitrines vendendo o que não existia: o cartão Premium/Estrada da
agenda ("Testar 30 dias" numa fase sem Premium), o **"Próximo degrau:
Premium — Subir"** do `drawProx`, e o "Tudo da Estrada" na lista do
Volante. A regra que ficou: **sumir parece defeito; vender seria mentira;
datar é roadmap.** O plano de fase futura aparece como cartão apagado
(`.plano.pfuturo`) com preço, o que abre e `chega na V{n} — {nome}`, sem
botão de assinar. `detPlano(k)` conserta heranças ("Tudo da Estrada" vira
"Tudo do Carona" quando a Estrada não existe). Guardado em `versoes.js` 7c.

### Achar alguém e Porta-malas (24/ago)

**Achar alguém** (`achar`, Fase 1, ambos): Victor: *"como eu vou achar a
pessoa?"* — não achava; a busca era de contratante e trancada no Volante.
A fronteira que a tela declara e `test/achar.js` jura: **achar a PESSOA é
grátis; quem está LIVRE é o que o Volante vende** — a lista nunca mostra
disponibilidade, senão a busca por nome vira a Escuta de graça.

**Porta-malas** (`malas`, Fase 3, ambos): a dor do Drive — zip que trava,
throttle, RAW sem preview. Demo honesta: banner "nada sobe nem desce",
partes retomáveis DITAS em número, MD5 como comparação, preview declara
"o RAW não foi baixado" e o quadro é DESENHADO (fingir frame de filme
seria inventar material de alguém). Fase 3 e não 1 porque depende de
servidor nosso (proxies via SDKs oficiais Blackmagic/RED, gratuitos).

### A OD sai e volta, e o orçamento sai de trás do logotipo (24/ago)

Victor: *"a ordem do dia só deixa montar no app; coloque uma opção pra
subir o documento da OD também, e de baixar um modelo com tabelas pra ele
preencher e depois subir. Às vezes a pessoa quer preencher depois, ou
editar, ou ir adicionando conforme organiza."*

O motivo é de ofício e ele tem razão: a OD nasce dias antes, muda quando o
cliente muda a locação, e quem preenche está no computador com a planilha
de produção do lado. Obrigar a montar bloco a bloco DENTRO do app é
obrigar a fazer de uma vez, na tela pequena, com a internet do set.

⚠️ **O MODELO E O LEITOR SÃO O MESMO FORMATO** (`OD_COLS`), e é o que faz
a volta funcionar. Trocar uma coluna do modelo sem trocar no leitor quebra
**calado** — o arquivo continua abrindo no Word. `od-sai-e-volta.js` fecha
o ciclo (gera o modelo, lê de volta, compara bloco a bloco).

⚠️ **NADA É APLICADO EM SILÊNCIO.** `lerODTabela` só INTERPRETA; quem
troca o cronograma é a pessoa, vendo quantos blocos vieram e com três
saídas — substituir, acrescentar, descartar. Sobrescrever o dia inteiro de
uma gravação sem confirmar é perda que ninguém desfaz na véspera, e o
arquivo pode ter vindo de outro job.

⚠️ **A HORA DO ARQUIVO É IGNORADA DE PROPÓSITO.** Volta a duração; a hora
se reencadeia a partir da chamada. É a lei da tela desde que ela nasceu —
mexeu numa preparação, o dia inteiro anda junto.

⚠️ **Como se sabe que uma linha é cena**, e a regra 3 é a que faltava:
(1) palavra conhecida no começo → aquele bloco; (2) primeira coluna
numérica → cena, sempre; (3) **nome livre COM luz, local e sinopse vazios
→ bloco de apoio**. Sem a 3, "Desprodução" virava uma cena chamada
Desprodução e o documento saía com uma cena que não existe.

⚠️ **PDF fica de fora** (o roteiro aceita): PDF preserva a aparência da
tabela e perde a estrutura — o texto sai numa coluna só. Aceitar para
falhar sempre é pior que não aceitar.

**E o orçamento**: *"tá bem escondida e não está adequada ao tamanho da
tela."* Duas coisas, as duas medidas:

* a tela chamada "a partir do roteiro" **abria com o bloco de logotipo**, e
  o campo do roteiro ficava a ~1.100px de rolagem no celular. Timbre é
  configuração de UMA vez e fica salva; roteiro é o que se faz toda vez. O
  timbre desceu e virou `<details>` recolhido — com resumo na cabeça, que
  é a regra da sanfona do Meu perfil: **fechado é índice, não esconderijo**;
* **no celular o Orçamento tinha UMA porta** (a gaveta, dois toques),
  contra duas de Jobs e Equipe. A barra de baixo já está nos sete itens que
  cabem a 390px, então a porta nova é uma PONTE em Montar equipe — quem
  monta escala é quem pensa em custo. **Mesmo defeito do "Montar equipe sem
  porta", mesma correção**: contar portas VISÍVEIS a 390px, não telas.
* seis placeholders cortavam a 346px. A suíte mede largura de texto contra
  largura de campo e reprova — placeholder que não cabe é texto que ninguém
  lê inteiro.

⚠️ **E o `<details>` quebrou a suíte `orcamento` — que só foi descoberto em
25/ago.** `fill()` exige elemento VISÍVEL, e o timbre passou a nascer
fechado: o teste estourava em timeout mudo no `#oc-contato`. A correção é o
teste (ele abre o `summary`, que é o que a pessoa faz), e ela ganhou duas
asserções novas de graça: o timbre nasce recolhido e a cabeça dele resume o
que tem dentro. ⚠️ **A falha ficou três dias escondida porque a bateria
daquela leva NUNCA TERMINOU** — o reset de container matou o processo em
`od-sai-e-volta`, alfabeticamente logo antes de `orcamento`, e eu li os
últimos ✓ como se fossem o fim. **Bateria interrompida não é bateria
verde: o que vale é a linha `N de N passaram`.**

### A tela de início do iPhone (24/ago) — `src/icone.js`, `html.app`

Victor: *"prepara o protótipo final para tela de app, pra eu colocar na
tela de início do meu iphone."* Sem as tags, "Adicionar à Tela de Início"
gera atalho que abre **no Safari, com barra de endereço**, e usa um
**print da página** como ícone.

⚠️ **O ÍCONE É A ÚNICA COISA DESTE PROJETO QUE NÃO CABE DENTRO DO HTML.**
O iOS ignora `data:` em `apple-touch-icon` — tem de ser arquivo servido
pelo domínio. Por isso `node src/icone.js` gera três PNG em `public/` e o
`publicar.js` os copia para a raiz do clone junto com o manifest. Se
sumirem do ar, o iPhone volta ao print de tela sem avisar ninguém.

⚠️ **`viewport-fit=cover` VOLTOU — mas SÓ em standalone**, e a distinção é
a lição inteira. No Safari ele cria a faixa embaixo da barra de abas que
custou cinco tentativas (ver a armadilha do cover, acima). Aberto pela
tela de início **não há barra de navegador**, então não há viewport visual
encolhendo e não há faixa a revelar — o defeito não pode acontecer.
`ligarModoApp()` lê `navigator.standalone` (iOS) ou `display-mode`
(resto), põe `html.app` e só então acrescenta o cover à meta. As regras de
`env(safe-area-inset-*)` são todas prefixadas por `html.app`.

⚠️ **`status-bar-style: black`, não `black-translucent`.** Translúcido põe
o conteúdo por baixo do relógio e exigiria compensar no topo; opaco custa
47px de altura e não custa defeito.

⚠️ **O nome embaixo do ícone é "Carro"** — o iOS corta em ~12 caracteres e
"Carro do Freela" viraria "Carro do Fr…". É como a casa se chama em voz
alta; o ícone carrega o resto. `tela-de-inicio.js` reprova nome mais longo.

⚠️ **As tags moram no `build.js`, não no template** (o template vira
artifact e artifact não tem `<head>`), então quem confere tem de olhar a
SAÍDA — e as sete, não só o index. A suíte também jura que elas **não**
estão no `artifact.html`: pôr ali para "resolver" aninharia dois
documentos no visualizador.

⚠️ Armadilha de teste: `setContent('<img src="file://…">')` numa página
`about:blank` nasce **broken em silêncio** — sem base para resolver o
caminho. Ler o PNG e passar como data URI resolve.

### ⚠️ FASE É INFORMAÇÃO INTERNA (24/ago, terceira leva)

Victor: *"Tira a parte que fala o nível das fases da homepage, essa
informação é interna. Não vou passar isso pro usuário não."* A regra que
substitui a anterior: o usuário fica sabendo **QUE** algo vem e **O QUE**
vem — nunca o roadmap numerado. O que mudou:

* a seção **A estrada saiu da homepage** de todos os builds (inclusive o
  completo), junto com a linha "Versão 1 — … ver a estrada" do hero;
* todo selo/aviso **"chega na V2 — nome da fase"** virou **"em breve"** /
  **"chega numa próxima atualização"** (planos, drawProx, Ajuda);
* o **modal do fasechip** parou de listar as seis fases: mostra só o que
  ESTA versão faz. O chip continua — é como o testador identifica o build;
* a homepage de cada fase vende só o que a fase tem: caíram na varredura o
  `li` do Carona ("contrato e sinal, taxa de 6%") e a nota Volante→Frota
  na V1 — os dois com `data-fase="2"` agora.

Confirmado na mesma mensagem: **o sinal de 20% NÃO entra na Fase 1** — e
`versoes.js` jura que a homepage INTEIRA da V1 não contém 20%, sinal,
garantia nem taxa (81 verificações).

⚠️ Lição de cirurgia: ao remover o bloco da estrada do JS, o corte de
`HE_TAG` até a cena levou `drawHome` e `drawJogo` junto — a homepage
inteira morreu com `drawHome is not defined`. Recuperado do HEAD do git.
**Cortar por âncoras exige conferir o que mora ENTRE elas.**

### A segunda leva de 24/ago: ajuda datada, lupa visível, sino, destino

Quatro pedidos do Victor na mesma mensagem, e o fio comum é o de sempre —
dizer a verdade no lugar onde a pessoa está olhando:

* **A Ajuda também é vitrine.** `abrirAjuda` ganhou fase em dois níveis:
  artigo (`AJUDA.moeda/taxas` têm `fase:2` e abrem com aviso datado) e
  LINHA — o último elemento numérico de uma linha do corpo é a fase dela,
  e a linha aparece com selo `chega na V2` + `.ajfuturo`, nunca some.
  Sete perguntas do FAQ e o passo 4 do "Como usar" levam selo na V1.
* **`.achbox`** — a busca de gente virou caixa com lupa no topo do Feed e
  do Montar equipe ("caixa de pesquisa com ícone de lupa, é mais
  intuitivo"). É um BOTÃO com cara de campo: o campo real mora no Achar.
* **`som("aviso")`** — notificação tem voz própria (quinta justa subindo,
  660→990). `avisar()` toca `o.som||"aviso"`: aviso sem som específico
  chegava MUDO. ⚠️ `movimento.js` exige paleta 100% usada — som novo só
  entra COM chamador.
* **Porta-malas com destino e navegador**: "senão fica tudo jogado".
  Subir = escolher arquivos (checkbox) E pasta (radio com o caminho por
  extenso, + criar pasta). Baixar = navegador de pastas com contagem e
  peso, "Você está vendo: <caminho>", arquivos com checkbox, e o preview
  de RAW ABRE DALI — espiar antes de decidir é o caso que vende.
  ⚠️ `display:grid` sem template dimensiona a coluna pelo CONTEÚDO: as
  linhas de pasta estouravam o modal até `grid-template-columns:minmax(0,1fr)`.

### A abertura: o login que piscava, e o carro que cobre o primeiro quadro (25/ago)

Victor: *"tem um bug assim que abre o site, é como se ele quisesse abrir a
aba de login primeiro e vai bem rápido pra homepage. Penso em colocar uma
animação do carro com o símbolo da carro do freela no começo, como se o
site tivesse carregando."*

⚠️ **OS DOIS PEDIDOS ERAM O MESMO CONSERTO, e a causa era uma palavra.**
`#v-entrar` era **a única `<section>` do markup sem `hidden`** — 26 seções,
25 fechadas. O navegador pinta o HTML antes de rodar o script, então o
primeiro quadro era a TELA DE LOGIN, e só depois o `show("home")` do boot
trocava. Não era lentidão nem animação faltando: era **ordem**. Ele
descreveu com precisão o que via.

⚠️ **O VÉU MORA NO MARKUP, NUNCA NO JAVASCRIPT.** Um `#splash` criado por
JS aparece **depois** do quadro que ele precisava cobrir — seria o mesmo
defeito com fantasia. Ele é `<div id="splash">` estático, com estilo na
própria folha, logo antes do `#pista`.

**A ideia usa o que a casa já tem, sem desenho novo:** o carro atravessa e
**as três barras da marca ficam onde ele passou** — no SVG do carro elas já
são as linhas de velocidade. A marca não é pintada por cima da animação;
ela é o **rastro** dele. Depois entra o nome, e o véu dissolve.

**A coreografia virou quatro atos (25/ago · 2, desenho do Victor):**
*"coloca o carro passando, ele dá uma leve parada quando chega no centro,
quando ele sai revela o símbolo, que cresce como se fosse atravessar a
tela e vira uma transição para a homepage."* Entra e freia (~0,6s) →
parada com as rodas paradas (~0,55s) → arranca revelando as três barras
UMA A UMA na ordem do rastro (pequena, média, cheia) → nome → e a saída é
a **travessia**: a marca escala até estourar a tela (scale 34) enquanto o
fundo do véu dissolve. O símbolo é a porta de entrada da home. Piso 2280ms.

⚠️ **As rodas não são `infinite`** — giram, param na parada e voltam, por
keyframes no MESMO relógio do carro (1,8s). Carro parado com roda girando
ninguém aponta mas todo mundo sente. E o easing mora POR TRECHO, dentro
dos keyframes — a lição da freada do carro grande.

⚠️ **Cada barra tem o SEU `@keyframes`** (`spbarra1/2/`): o `forwards`
congela o `to`, e as opacidades finais são as do desenho da marca
(.34/.64/1) — um `to{opacity:1}` comum apagaria a hierarquia. No markup as
barras são retângulos próprios, não `<use href="#mk">`: é o que deixa cada
uma acender na sua vez.

⚠️ **ANIMAÇÃO VENCE TRANSIÇÃO, e o nome pagou para ver.** O `forwards` do
`spnome` segurava `opacity:1` e o `opacity:0` da `.sai` nunca valia — o
nome ficava flutuando inteiro por cima da home durante a travessia.
`#splash.sai .sp-nome{animation:none}` é o conserto. Visto em quadro
congelado, não em asserção: o filme da suíte mede seção e véu, não cada
peça — screenshot continua sendo obrigatório em mudança de coreografia.

⚠️ **A COREOGRAFIA TEM DE ACABAR ANTES DE O VÉU SAIR** (a primeira versão
cortava a marca no meio da dissolvida). `test/abertura.js` mede a opacidade
da barra CHEIA (`.spb3`, não o svg pai — ele é opaco sempre e passaria à
toa) e do nome **no último quadro ANTES da saída** — não no quadro dela,
porque o `animation:none` do nome zera ele legitimamente no instante em que
a classe entra. Com `prefers-reduced-motion` a travessia vira fade simples
(zoom na cara é o que quem pede menos movimento pediu para não ver) e o
piso cai a 260ms.

⚠️ **NÃO EXISTE ESPERA FALSA.** A saída é disparada **no fim do boot**, não
num `setTimeout` solto — é esse ponto que significa "o app está montado", e
com a view certa já escolhida não há troca de tela por baixo do véu. O piso
é o comprimento da coreografia — o pedido de 25/ago foi explicitamente
MAIS abertura, não menos; com `prefers-reduced-motion` ele cai para 260ms,
o carro some e a abertura vira um cartão parado.

⚠️ **E ele é REMOVIDO do DOM depois da transição**, não só transparente:
véu invisível de tela cheia é um dia de caça a clique que não chega.

A suíte grava **um retrato por quadro** (seções visíveis + tamanho,
opacidade e fundo do véu) e jura três coisas que uma foto do fim não
pegaria: a tela de login não aparece em **nenhum** quadro; enquanto o véu
está de pé ele cobre 390×844 opaco; e o aviso de primeira visita abre
**depois** dele, não por baixo. Semeando o defeito (tirar o `hidden`), ela
reprova em 4 asserções — inclusive as duas do filme.

⚠️ Armadilha do corte no filme: o quadro em que a saída começa é o
divisor, **não o `sai` de cada quadro**. Depois de removido o véu, `sai`
volta a ser falso porque não há mais elemento — e a home legítima entrava
na conta de "seção descoberta".

### O som da abertura, e o portão que decide se ele toca (25/ago · 3)

Victor: *"Não tem som inicial? Pode colocar bem discreto. Só pra ter uma
interação e ser legal, mas sem ser chato de ficar ouvindo."* `SONS.abertura`
é o carro chegando — um rumor filtrado (lowpass 430→215 Hz) enquanto ele
entra e freia, e a buzina de longe da casa (a terça 440/554, serrote,
lowpass 600) no instante em que a marca acende.

⚠️ **Grave e discreto são coisas diferentes, e alto-falante de telefone não
toca grave.** A primeira versão morava lá embaixo (~90 Hz) e simplesmente
não existia no iPhone. A banda subiu para 430→215 Hz: continua sendo rumor,
mas rumor que o aparelho consegue reproduzir.

⚠️ **"Discreto" calibrado de ouvido saiu INAUDÍVEL.** Renderizado offline
contra a paleta, o primeiro som tinha pico **0,0166** — metade do som mais
baixo da casa (`leve`, 0,037). Hoje é **0,033**, medido, não achado. Som
novo se afere renderizando e comparando com os que já existem; ouvir no
container não afere nada.

⚠️ **O PORTÃO: se não dá para tocar AGORA, não toca nunca.** O
`AudioContext` nasce `suspended` por política de autoplay, e — esta é a
armadilha — **nó agendado em contexto suspenso não é descartado: fica na
fila e dispara tudo junto no primeiro `resume`**. O toque despretensioso do
usuário meia hora depois traria a abertura inteira de volta, fora de hora.
Por isso `abrirComSom()` confere `a.state==="running"` e desiste em silêncio
se não estiver. `test/abertura.js` guarda exatamente isso: **nada pode estar
agendado num contexto suspenso**.

⚠️ **Quem não ouviu na primeira vez ganha um convite, não uma repetição.**
A dica `toque para ouvir` aparece nas primeiras 4 aberturas e some para
sempre no primeiro toque (`cdf-abertura-toque` guarda `-1`). E ela nasce em
**1s**, não no fim: aos 2,95s o véu vira `pointer-events:none`, e pedir
toque numa tela que não aceita mais toque é mentira de interface.

⚠️ **No toque, `t0` é o começo da ANIMAÇÃO, não do dedo.** Lê-se
`getAnimations()[0].currentTime` e passa-se o negativo — assim a buzina cai
no quadro em que a marca acende, e não 2,24s depois do dedo, com a abertura
já acabada. Com `prefers-reduced-motion` não há som: quem pediu menos
movimento não pediu mais barulho.

### Depoimentos e prova social na home (25/ago · 4) — `#h-depo`

Victor: *"exemplos de Depoimentos e provas sociais de Freelas e Contratantes
que 'já usaram' a plataforma, pra poder dar um peso de que vale a pena."*
Quatro cartões entre "Quem é" e os planos: dois de quem faz e dois de quem
contrata — o último `data-fase="2"`, porque fala de coisa que só existe lá.

⚠️ **O aviso vem ANTES dos cartões.** Prova social inventada sem etiqueta é
depoimento falso — o `.aviso` diz que são exemplos escritos para a
demonstração, e diz isso **acima**, onde se lê antes de acreditar, não num
rodapé embaixo do quarto cartão.

⚠️ **Aspa decorativa é texto ilegível para o auditor — e o auditor tem
razão.** O glifo grande de abertura reprovou em `contraste` (1,34 e 1,61):
um `"` de enfeite em cinza claro é, para quem lê com dificuldade, uma letra
apagada na tela. O conserto foi na raiz, não no token: as aspas viraram
**pontuação dentro da frase**, no mesmo `<p>` e na mesma cor do texto.

### A doca do desktop, e o indicador que desliza (25/ago · 5) — `test/doca.js`

Victor: *"coloca também um menu flutuante na parte de baixo do site, isso no
desktop... também uma leve transição do menu que está pra o outro clicado."*
No celular a `.bottombar` continua sendo a barra cheia de sempre; a partir de
821px ela vira uma **doca** flutuante e arredondada, com rótulo ao lado do
ícone. O `.btind` é a pastilha que escorrega do item anterior para o clicado.

⚠️ **É A MESMA `<nav>` nas duas formas.** Duplicar a nav duplicaria `#bg-bot`
e `#bg-gui`, que moram dentro dela — e `getElementById` para no primeiro do
DOM (o defeito do `fd-foto`, 20/ago). Pior: a sonda passaria, porque o
Playwright também casa com o primeiro. As duas formas moram em media queries
**separadas**, senão o `transform` de fora venceria por ordem de arquivo.

⚠️ **`getBoundingClientRect()` MENTE onde há `body{zoom}`.** A 1400px o corpo
tem `zoom:1.1`: o rect vem em pixel **visual** e o `style.width` escreve em
pixel de **layout** — a pastilha ficava 10% maior e deslocada, e só a 1440.
`moverInd()` usa `offsetLeft`/`offsetWidth`, que já vêm em layout. Bug que
só existe numa largura é bug que passa despercebido.

⚠️ **A transição só nasce depois da primeira colocação.** Sem isso a pastilha
viaja do canto esquerdo até o primeiro item na abertura, como se alguém
tivesse clicado. Mede-se, coloca-se, e só no `requestAnimationFrame` seguinte
entra a classe `pronto`, que é quem carrega o `transition`. Com
`prefers-reduced-motion` a transição é `none`: ela salta, não desliza.

⚠️ **Item invisível não tem largura, e `0` é uma posição válida.** Se a doca
está `hidden`, ou o item ativo é de outra fase, `offsetWidth` é 0 — a
pastilha some (`opacity:0`) em vez de virar um risco no canto. Chama-se
`moverInd()` do `show()` (depois de `medirBarraBaixo()`) e no fim de
`aplicarModo()`, porque trocar o lado da conta troca os itens.

⚠️ **A doca empurrou o rodapé e consertou o `orcamento` por acidente.**
`body{padding-bottom:108px}` deixou a página alta o bastante para o
`scrollIntoView({block:"start"})` de `#oc-papeis` completar; sem ele, o
seletor de papel parava embaixo da faixa fixa de cima. Isso já era sorte
antes. Hoje é regra: `#oc-papeis{scroll-margin-top:88px}`.

**Fica em aberto para o Victor:** no desktop existem agora DUAS navegações
com estado ativo — a faixa de abas de cima (10 itens) e a doca (7). Aposentar
a de cima é a alternativa, e ela mexe no seletor de várias suítes.

### O brechó chegando ao feed (25/ago · 6) — `test/anuncio-no-feed.js`

Felipe, testador, em áudio: *"não sei se a galera vai engajar e postar umas
parada."* A dúvida é boa e é a certa: **enquanto o feed depender de alguém
DECIDIR escrever, ele tem razão.** O anúncio do brechó é o único conteúdo da
casa que já é subproduto de trabalho que a pessoa faz de qualquer jeito —
ela põe a lente à venda porque quer vender a lente, não para alimentar feed.
Agora o anúncio de quem você segue aparece no feed, com foto, preço e o selo
de garantia, e o toque leva ao anúncio de verdade.

⚠️ **DERIVADO, NUNCA FABRICADO — e esta é a linha inteira.** O cartão **não
entra em `POSTS`**, não usa a classe `.fdpost` e não nasce com curtida,
comentário nem compartilhamento. Post escrito pela plataforma na voz da
pessoa seria mentira; curtida de brinde seria engajamento inventado. E a
classe própria guarda de quebra as suítes que contam `.fdpost` para dizer
quantos posts existem — com o anúncio entrando na conta, elas passariam a
medir mentira sem acusar nada. Foi o que quebrou `feed.js`: ele pegava
`.fdtopo b` da lista inteira e cortava "os 5 primeiros".

⚠️ **A hora sai de `dias`, que é o que o anúncio já guarda.** Sem isso todo
anúncio entraria no topo como se fosse de agora, e o feed viraria vitrine.
Post e anúncio vão na MESMA lista ordenada pelo relógio: "seção de anúncios"
no fim é seção que ninguém rola até.

⚠️ **Vendido e reservado somem sozinhos.** Anunciar de novo o que já foi
vendido é fazer a pessoa perder a viagem — e é o tipo de defeito que só
aparece na segunda semana, quando as primeiras vendas fecham.

⚠️ **E ele respeita a fase**: o feed só busca anúncio onde o brechó de venda
existe (`faseTem(FASE_BP.vender)`). Cartão apontando para uma tela que ainda
não abriu é porta pintada na parede.

⚠️ **`test/doca.js` reprovou por causa disto, e a correção diz o quê.** Ela
zerava só `POSTS` para simular o dia 1, e o anúncio passou a segurar a praça
de pé. Isso é a melhoria funcionando. O dia 1 de verdade zera TUDO — e antes
de zerar, a suíte agora mede justamente o contrário: **sem ninguém ter
postado, o brechó sozinho enche o feed.**

**O outro áudio do Felipe é elogio, e contradiz o testador anterior.** Ele
diz, com todas as letras, *"eu **não** achei muito texto"*, *"achei muito
explicativo, tem tudo"* e *"**não** achei complicado"* — o oposto do "muita
coisa pra ler" que motivou o trabalho de densidade de 23/ago. Dois
testadores, duas leituras: fica registrado que **densidade não tem resposta
única**, e que o trabalho de 23/ago não se desfaz por um depoimento nem se
mantém por outro.

### ⚠️ O ARNÊS ESCONDIA O MOTIVO, E EU LI O CÓDIGO DE SAÍDA ERRADO (25/ago · 6)

`orcamento` reprovou na bateria e passou sozinha. A linha na tela era
`✗ orcamento  69s` **pelada**: sem contagem, sem motivo.

⚠️ **O `run.js` só lia o `stdout`.** Suíte que ESTOURA (locator sem
elemento, promessa não tratada) morre com o rastro no `stderr` e o `stdout`
sem a linha `N ok, M falhas`. Na tela isso é indistinguível de asserção
reprovada. Hoje o arnês lê os dois, marca `(estourou — não chegou ao fim)`
quando não há contagem, e diz `morto por tempo (240s)` quando foi o teto.

⚠️ **E o erro maior foi meu: li o código de saída do COMANDO EMBRULHO.**
Rodei `npm test > log; echo EXIT=$?; tail ...` — o `$?` que sobra é o do
`tail`, sempre 0. Reportei "bateria verde, 71 de 71" com uma suíte reprovada
dentro do arquivo. **O que vale é a última linha do log (`N de M passaram`),
lida com o olho — nunca um código de saída de pipeline que passou por outro
comando.**

## 12/set — o brechó volta para a Fase 1, e um defeito que estava no ar

Victor pediu o mapa do que falta para lançar a Fase 1. Ler o PRD contra o
código achou uma discordância entre os dois, e rodar o build da Fase 1 num
navegador achou um defeito do produto COMPLETO.

### ⚠️ O PRD e o código discordavam sobre o que é a Fase 1

O PRD v3.0, seção 08, lista **"brechó, só venda"** DENTRO da Fase 1, e dois
critérios de pronto dependem de anunciar ("um freela anuncia uma lente em
menos de 3 minutos", "quem já preencheu o inventário anuncia sem digitar a
ficha de novo"). O código fazia o contrário: `FASE_BP.vender` valia 2.

Medido no navegador, entrando como freela na `fase-1.html`:

| painel | Fase 1, antes |
|---|---|
| comprar | visível |
| oportunidades | visível |
| inventário | visível |
| **vender** | **escondido** |
| alugar | escondido |

**A fase abria uma vitrine onde ninguém podia pôr nada à venda** — e o chip
da versão prometia "✓ Brechó — anunciar e vender equipamento".

⚠️ **A origem foi um mal-entendido meu de uma frase.** *"A segunda fase em
diante já pode mandar a aba brechó completa"* virou "o brechó todo vai para
a 2". O argumento que eu mesmo registrei para mover — *só fica de pé com
pagamento* — vale para o ALUGUEL, que cobra 5% do período. Anunciar não
cobra nada de ninguém, exatamente como o inventário, que ficou na 1 por
esse motivo. Victor, ao ver o achado: *"comprar e vender é algo meio óbvio
que tem que ter, pq se a pessoa vai comprar, alguém tem que colocar pra
vender."*

### ⚠️ E `vender:1` SOZINHO teria publicado promessa de pagamento

Este é o ponto que quase passou. O painel "Minhas vendas" **é a carteira**:
ele abre com take, pedágio, saque e extrato, e cada grupo de anúncio fala em
taxa de 5%, valor retido, custódia de três dias e impulsionado de 10%.
Ligar o painel na Fase 1 quebraria o último critério de pronto da seção 08
— *"nenhuma tela promete garantia, custódia ou pagamento que ainda não
existe"* — que é a regra mais importante da fase.

**O conserto seguiu o padrão que a casa já tinha**, e é o mesmo parágrafo do
sistema de fases: *`comGarantia` devolve falso abaixo da Fase 2, e com isso
a escala inteira fecha em acerto direto — um gate só, e o app todo se
comporta como a fase.* O brechó ganhou os dois irmãos dele:

```js
const anGar=a=>faseTem(2)&&!!(a&&a.gar);   /* o anúncio tem garantia? */
const vendaComDinheiro=()=>faseTem(2);     /* taxa, carteira, custódia, turbo */
```

O caminho já existia no produto: anúncio sem garantia já dizia "Falar com o
vendedor" e "combinação e pagamento direto com o vendedor". O gate só faz a
fase inteira cair nele. **Nenhum fluxo novo para manter.**

O que mudou de lugar, e por quê:

- `FASE_BP.vender` voltou para **1**; `alugar` continua em 2.
- A carteira e o extrato ganharam `data-fase="2"` no markup.
- A Fase 1 ganhou **porta própria** (`#ct-novo1`, `data-fase-ate="1"`) em vez
  de mover o `#ct-novo` que já existia. ⚠️ **Mover mudaria a ordem da tela no
  build completo, e `FASE=0` tem que ser no-op** — é a decisão central do
  sistema de fases. Porta nova nasce hidden e não toca em nada.
- Cada texto que citava dinheiro passou a derivar de `vendaComDinheiro()`.
  O Impulsionar sumiu da Fase 1: ele é receita (10% em vez de 5%), então
  numa fase sem taxa ele não teria nem o que trocar.
- `FASE_ENTREGA[1]` virou **"Brechó: anunciar e vender equipamento, em acerto
  direto"**. ⚠️ O "acerto direto" não é detalhe: sem ele a linha deixa a
  pessoa esperar carteira.

⚠️ **A CAIXA ESCONDIDA CONTINUA MARCADA — e ler só ela era um defeito novo.**
`#nv-gar` ("vender com compra garantida") ficou hidden por `data-fase`, mas
`checked` segue `true`. A conta do anúncio novo lia a caixa direto e mostraria
taxa de 5% e carteira numa fase que não tem nem uma nem outra. Hoje existe
`nvGarOn()`, e quem decide é o gate — a caixa só opina onde ela aparece.
**Regra geral: elemento escondido por fase não perde valor, e quem lê valor
de elemento escondido lê uma decisão que ninguém tomou.**

### ⚠️ O DEFEITO QUE ESTAVA NO AR: "Falar com o vendedor" abria o checkout

Achado no build COMPLETO, não no da fase — estava publicado.

No anúncio sem garantia (o Aputure Amaran 200D da semente), a linha de
entrega dizia *"Sem garantia: combinação e pagamento direto com o
vendedor"*, o botão dizia *"Falar com o vendedor"* — e o toque abria um
modal **intitulado "Comprar com garantia"**, com Pix, cartão de crédito e
saldo da carteira, para um anúncio que não tem garantia nenhuma.

`bc.onclick=()=>abrirCompra(a.id)` era incondicional. Hoje:

```js
if(bc) bc.onclick=()=>anGar(a)?abrirCompra(a.id):abrirDM(a.dono);
```

⚠️ **Por que ele sobreviveu a 74 suítes:** todas exercitavam a compra pelo
anúncio COM garantia, que é o caminho principal. O anúncio sem garantia é um
item só na semente, e ninguém tinha clicado no botão dele. **Caminho
secundário sem asserção é caminho não testado** — e este virou o caminho
principal da Fase 1 inteira, onde `anGar` é falso para todo anúncio.

### O que a suíte passou a guardar

`versoes.js` tinha uma asserção exigindo que a Fase 1 **não** tivesse
"Minhas vendas". Ela foi virada do avesso — e isso não é afrouxar teste, é o
produto ter mudado de propósito; o porquê está escrito no comentário dela,
como manda a casa. No lugar de uma asserção entraram sete, mais duras:

- a Fase 1 **tem** "Minhas vendas" e **não** tem "Alugar";
- o atalho `painelBrecho("vender")` abre mesmo o painel na Fase 1;
- "Anunciar equipamento" está à vista;
- carteira e extrato **não** aparecem na 1, aparecem na 2, e o build padrão
  nunca perdeu nenhum dos dois;
- **nenhuma linha** do painel da Fase 1 casa com `/taxa de 5%|caem na sua
  carteira|entram na carteira|retidos na plataforma|Impulsionar|em custódia/`;
- na Fase 1 o botão do anúncio diz "Falar com o vendedor" e **abre a
  conversa, nunca o checkout**; na 2 volta a abrir o checkout.

### ⚠️ `npm run build` NÃO REGENERA AS FASES — e a suíte testa ARQUIVO

A bateria veio 73 de 74, com `versoes` estourando em
`ReferenceError: anGar is not defined` — uma mensagem que não diz nada sobre
a causa e manda caçar escopo de JavaScript.

A causa: **`npm run build` gera só o `index`.** As seis fases só saem por
`npm run publicar` — ou, agora, por `npm run build:fases`, que foi criado
nesta leva. Eu tinha rodado `--fase=1` à mão para sondar, então `fase-1.html`
estava fresco e as fases 2 a 6 continuavam sendo o build de duas semanas
antes, sem `anGar` dentro.

⚠️ **O CASO PERIGOSO NÃO É O ESTOURO, É O SILENCIOSO.** Se a leva não tivesse
tocado em nada que a suíte olha, ela teria passado **verde contra seis
arquivos velhos** — dando por testado um produto que ninguém construiu. É
irmão exato do reset: a árvore parece certa e o conteúdo é de outro dia.

Hoje `versoes.js` compara o `mtime` dos sete builds com o do
`src/template.html` e reprova com o nome de cada defasado e o comando para
consertar. **Comparar data de arquivo é o detector mais barato que existe**,
e é o mesmo princípio do `assert` na âncora dos patches.

### ⚠️ `innerText` DE SUBÁRVORE NÃO RENDERIZADA IGNORA `hidden`

Na rodada seguinte, `versoes` acusou *"o aluguel vazou para dentro da Fase
1"* — e o produto estava certo. Quem tinha mudado era a sonda.

A sonda nova do anúncio chama `abrirAnuncio()`, que troca a seção visível.
A sonda seguinte lia `innerText` de `#bp-inv`, que a partir dali estava
dentro de uma subárvore **não renderizada**. Medido, no mesmo aparelho e na
mesma fase:

| com o brechó na tela | com o anúncio na tela |
|---|---|
| 2849 caracteres | 2853 caracteres |
| **0** linhas de aluguel | **2** linhas de aluguel |

As duas linhas são `#inv-cat` e `#inv-sim`, as duas com `data-fase="2"` — e
`hidden` seguiu `true` o tempo todo, conferido a cada passo. **`innerText`
só respeita CSS enquanto o elemento é renderizado; fora disso ele degenera
para `textContent`** e devolve o markup inteiro, escondido incluído.

Duas regras que saem daqui, e valem para toda suíte deste projeto:

- **Sonda que navega, navega de volta.** A do anúncio hoje termina com
  `show('brecho'); painelBrecho('inv')`.
- **Asserção que lê `innerText` depende da tela estar VISÍVEL.** Se não
  estiver, ela está lendo markup e não tela — e vai passar ou reprovar por
  motivo nenhum. É primo do defeito da `.bottombar` medida com `offsetWidth`
  zero: elemento fora da tela mente sobre si mesmo, de um jeito diferente
  em cada API.

### Documentos atualizados na mesma leva

- **`docs/prd.html` → v3.1.** ⚠️ A capa dizia "Versão 2.0 · protótipo
  v20/ago · 15" e o rodapé assinava "PRD v3.0 · v23/ago · 5, 64 suítes": o
  documento se contradizia na primeira e na última linha. Entraram a seção
  **08a (o agente de WhatsApp)**, a **evidência de campo** de 25/ago na
  seção 13 — ela estava só aqui no guia, e a seção de riscos ainda dizia
  que nada tinha sido validado —, a tabela do que foi construído entre
  25/ago e 12/set, e a caixa do descompasso acima.
- **`docs/plano.html`**: o domínio saiu do caminho crítico.

## 13/set — o selo: a trava que não precisa do segredo para funcionar

A leva de 12/set terminou pronta e **não conseguiu subir**. O ensaio
(`--seco`) reprovou na primeira trava, e a trava estava certa: sem
`src/crew.local.json` a varredura de nome real passa por ausência, e passar
por ausência não autoriza publicação.

O arquivo não existia porque o container tinha sido reciclado levando o
diretório inteiro. E aí a pergunta deixou de ser "onde acho o arquivo" e
passou a ser outra.

### ⚠️ O FURO ERA DE DESENHO, E ESTAVA À VISTA O TEMPO TODO

**A trava exigia, para autorizar a publicação, justamente o único dado do
projeto que não tinha cópia em lugar nenhum.**

Enquanto o arquivo existia, isso parecia rigor. No dia em que sumiu, virou
publicação travada **para sempre** — não esta leva: toda leva daí em diante,
até alguém reconstruir uma lista de 109 nomes reais só para poder publicar.
Que é criar de novo, à mão, o problema que a regra existia para evitar.

⚠️ **A regra em si funcionou.** Varri os **63 commits** desta árvore, do
primeiro (17/ago) até hoje: `src/crew.json` tem **um único conteúdo em toda a
história** — 109 registros, começando em "Paula Santos", zero telefones. O
dado real nunca chegou ao repositório. Não houve vazamento por ali, e também
não há recuperação por ali. **As duas faces da mesma moeda.**

### A decisão do Victor fecha a questão

*"Não quero a lista original com os nomes da planilha, era só pra eu
visualizar a plataforma com nomes reais. Pode deixar os fictícios e quando
for lançar não vai ter nenhum nome inscrito, pq as pessoas vão começar a se
cadastrar do zero."*

Isso **confirma o PRD**: os 109 sempre foram lista de CONVOCAÇÃO, não contas.
O `crew.local.json` era conveniência de protótipo, nunca peça do produto.

⚠️ **Não o reconstrua sem o Victor pedir.** É a lição mais fácil de perder
aqui: a saída "óbvia" para a trava era refazer o arquivo, e refazê-lo seria o
único movimento realmente perigoso de toda esta leva.

### O selo, e por que ele é mais forte que o que havia

Para que a trava usava o dado real? Para responder **uma** pergunta: *o
`crew.json` versionado ainda é o fictício aprovado?* Isso uma impressão
digital responde sem o segredo.

`src/crew.selo.json` guarda o sha256 do seed aprovado. O cenário de 23/ago —
reset trocando a lista — muda o hash e reprova igual.

| | trava antiga | selo |
|---|---|---|
| precisa do dado real no container | **sim** | não |
| pega reset que troca a lista | sim | sim |
| funciona num clone limpo | **não** | sim |
| pode ser versionado sem expor ninguém | — | sim |

⚠️ **O SELO É A IMPRESSÃO DIGITAL DE UM ARQUIVO QUE JÁ É PÚBLICO.** Versioná-lo
não expõe nada — é o hash do `crew.json`, que qualquer um que tenha o
repositório já pode calcular. É o que torna a troca possível.

**O que o selo NÃO pega**, e está escrito dentro dele: nome real digitado à
mão em outro arquivo (guia, fixture, documentação). Disso cuidava a varredura
completa, que só existe com cofre. Hoje o risco disso é outro — não há mais
lista real de onde copiar um nome.

### `sem-nome-real.js` em três camadas

As duas primeiras valem **sempre**, com ou sem cofre:

1. o selo bate, e o seed não tem telefone nem campo de telefone dentro;
2. nenhuma sequência com jeito de número brasileiro no seed;
3. se o cofre voltar um dia, a varredura completa do repositório volta
   sozinha — o código dela ficou onde estava.

De 1 asserção ("pulou por ausência") para **5 que de fato conferem**.

⚠️ **A MENSAGEM DE FALHA DIZ O QUE NÃO FAZER, e isso é de propósito.** Quem vê
"o selo não bate" às pressas tende a reselar para destravar — que é
exatamente o movimento errado se a causa foi um reset. Então ela imprime o
selado contra o encontrado, os dois com contagem e primeiro nome, e manda
recuperar o arquivo do repositório em vez de reselar.

### `src/selar-crew.js` — e por que ele resiste a ser usado

Trocar o seed de propósito (mais cadastros, outra praça) muda o hash, e aí o
selo precisa ser refeito. O script existe para isso e **recusa-se a ser um
carimbo**:

- sem `--confirmo` ele **não escreve nada**, só mostra o que mudaria;
- imprime o selo guardado ao lado do encontrado, com contagem e nomes das
  pontas, e pergunta em voz alta *"esta lista é fictícia?"*;
- **reprova sozinho se achar telefone** no `crew.json`, antes de qualquer
  selo sair — a restrição nº 1 não passa por aqui nem com `--confirmo`.

### Conferido

O ensaio, que reprovava, passou inteiro: três travas verdes, sete builds
anônimos gerados e conferidos **no arquivo escrito** (fase certa, versão
certa, nome reduzido de fato, zero telefone).

E a trava foi testada **reprovando**, que é o teste que importa: numa cópia
da árvore, adulterei o `crew.json` (110 registros, primeiro nome trocado) e a
suíte reprovou com código de saída 1, nomeando o que estava selado e o que
encontrou.

## 17/out — a home que diz o que é (`test/home-clara.js`)

Victor, sobre a home de 04/out: *"não dá pra entender nada, no mobile tá
confuso e a imagem de fundo não condiz com o que quero pra plataforma.
Pense no mobile também."* Medido antes de mexer: **16 telas de rolagem**
no iPhone, nove seções competindo, e um topo que não dizia o que o
produto faz — a manchete ("Escale sua equipe sem adivinhar") pedia que a
pessoa já soubesse o que era a casa, e a foto de set na praia dizia
"audiovisual" e mais nada.

### O topo responde em ordem: o quê, para quê, para quem

| camada | o que diz |
|---|---|
| olho (`.hp-olho`) | **Agenda e contratação de equipe audiovisual** — a categoria |
| manchete (`#hh-t`, `FASE_HERO[0]`) | **Ache freela de audiovisual livre na sua data.** — o que se faz aqui |
| sub (`#hh-s`) | as funções, a praça e o caminho (dia → quem está livre → chamar) |
| dois botões | **Quero contratar** · **Sou freela** — um por lado |

⚠️ **Cada botão abre o login JÁ NA ABA DO LADO.** `data-lg` no
`.entrar-cta`; o handler global põe `LG_TIPO` e chama `pintarLogin()`
antes do `show("entrar")`. Botão sem `data-lg` (o "Entrar" do topo, os
dos planos) continua neutro. Escolher "Quero contratar" e cair na aba do
freela seria a pessoa escolher a mesma coisa duas vezes.

A Fase 1 mantém a manchete dela ("Quem tá livre sábado?"), com a sub
encurtada e sem dinheiro — `versoes` guarda as duas.

### A foto saiu; a ilustração do topo é A PRÓPRIA BUSCA

O cartão `#h-jogo` (o id ficou: é o alvo do "Experimente" do menu da home)
é a busca de dentro em miniatura, e funciona sem conta: **os sete dias**
(`.hp-dia`), **as seis funções** (`.hj-chip` — a contagem que `versoes`
cobra) e **quatro pessoas livres com rosto**. Ele substitui o jogo de
assentos do carro, que era bonito e não explicava nada.

- **Status e contagens saem da MESMA `status()` da plataforma**; a suíte
  confere cada linha contra a base, não contra o próprio cartão.
- **Sem filtro a lista alterna as funções** (`hjOrdem`): quatro operadores
  de câmera seguidos diriam "isto é um app de câmera".
- **As seis funções são as que quem contrata procura primeiro** (`PREF`:
  câmera, editor, drone, fotógrafo, direção de fotografia, colorista),
  completadas pelas mais cadastradas se a base não tiver alguma. Ordenar
  só por contagem punha "Op. de gimbal" em segundo, que é acessório.
- ⚠️ **Nome e rosto aparecem, e o cartão diz "Perfis fictícios, só para
  demonstração".** A regra antiga do jogo ("endereço público mostra
  contagem, não pessoa") era de quando a lista era real; desde 13/set ela
  é fictícia, e o build público ainda reduz o sobrenome à inicial.
  **Sem diária, telefone ou @** — isso fica do lado de dentro, e a suíte
  reprova `R$`, `(84)` ou `@` dentro do cartão.
- `hero` e `recorte` saíram do `fotos.json` (118 KB que ninguém via).
  Rostos e capas por função ficam.

⚠️ **A sub não diz "som" nem "luz"** — nenhum dos 109 cadastros faz som
direto, e só dois fazem luz. A frase lista o que a base tem (câmera,
drone, foto, edição). É a regra do guia: *"uma função 'som direto' que
não existe em nenhum cadastro"* já foi defeito aqui uma vez.

### Celular: de 16 telas para 8,6

| o que | como |
|---|---|
| hero | manchete + dois botões **lado a lado** + começo da busca na 1ª tela (390 e 360) |
| Como funciona | 4 passos de uma frase; saíram os painéis "Ao vivo" e "Praças" (a busca do topo já mostra isso) |
| Garantia | mesma regra, metade do texto; "Se cancelar" virou `<details>` |
| Para quem é | 3 itens e um botão de cada lado |
| Depoimentos | trilho de arrastar (`.depos` flex + scroll-snap ≤620px), aviso numa linha |
| Planos | **dois trilhos** (`.pl-trilho`): `display:contents` no desktop — a grade de três segue igual —, carrossel no celular |
| fechamento | os dois botões de novo; saiu a nota "a cena é desenhada em código" |

⚠️ **`.pl-trilho` é escopado em `#h-planos`.** `.planos` também é a grade
da tela de Planos de dentro (`#pn-grade`), e ela não pode virar carrossel.

⚠️ **O carrossel não esconde card**: os seis `.plano` continuam no layout
(as suítes de planos contam e leem o texto), só ficam lado a lado. Os
trilhos sangram até a borda com `margin:0 -22px` casado com o padding do
`.wrap` — sem rolagem horizontal na página (a suíte mede em 360 e 390).

⚠️ **A bateria desta leva deu 76/77, e o `feedback` era o AMBIENTE.** A
rede do container passou a deixar o preflight chegar ao web3forms, que
devolve erro de CORS — e o Chromium atribui esse erro à página
(`file://…/index.html`), não ao web3forms, então ele escapava do filtro da
suíte. Provado rodando a suíte no build de 04/out: falha igual. O filtro
passou a reconhecer o mesmo erro pelo TEXTO (`api.web3forms.com`); qualquer
outro erro de console continua reprovando. E a primeira tentativa de
bateria rodou DUAS vezes ao mesmo tempo (um `npm test` em segundo plano que
parecia morto) — a regra "bateria com outra coisa junto não é bateria"
pegou de novo: matar tudo e rodar uma só.

~~A cena desenhada do carro continua no fechamento.~~ **Saiu em 17/out ·
2**, junto com os depoimentos — ver a seção seguinte.

## 17/out · 2 — vitrine, não manual: a home em blocos e a dieta de texto

Victor, sobre a home de 17/out · 1: *"Informação demais, precisa cortar
muito a quantidade de texto da plataforma, inclusive da homepage, precisa
ter cara de plataforma grande e ser intuitivo. Fácil de entender sem fazer
a pessoa ler muito… Olha o site da ElevenLabs, Apple."* Medido antes:
**1.290 palavras na home**; vitrines trancadas com parágrafo de 40 palavras
mais duas notas de rodapé; cartão de proposta repetindo a mesma frase em
cada cartão.

### A régua da home, e a suíte que a guarda (`home-clara`, 1b)

**Cada bloco é UM título curto + UMA linha + UM visual vivo.** Parágrafo
explicativo não mora na home — mora na Ajuda e dentro do produto, onde a
pessoa já decidiu ficar. A suíte reprova parágrafo com mais de 20 palavras,
home com mais de 700 palavras (hoje ~610, a maior parte nomes da busca e
preços) e mais de 9 telas no celular (hoje ~7,3).

| bloco | id | visual (todo DERIVADO) |
|---|---|---|
| Passe o carro | `#hb-carro` | a van atravessa; quantos livres de câmera AMANHÃ receberam (`status()`), e o primeiro deles "pegou a vaga" — perfil fictício |
| Custo somando | `#hb-custo` | 2× câmera + drone + editor pela **média da `REFERENCIA`** (faixa da praça, nunca diária de pessoa), barra contra um orçamento |
| Agenda que vende | `#hb-semana` | os 7 dias da conta de demonstração por `statusEu()` |
| Pagamento garantido | `#h-gar` (fase 2) | 20% / 80% |
| Acerto direto | `#hg-f1` (até fase 1) | você — equipe |
| O take | `#h-moeda` (fase 2) | a moeda 3D de sempre + `.moedapar` (a `take` cobra os dois) |
| Brechó do set | `#hb-brecho` | as fotos de categoria (`FOTO_CAT`) |

Cada bloco anima **uma vez** ao entrar na tela (`ligarBento` → `.vivo`);
sem observador ou com movimento reduzido o CSS já mostra o estado final —
por isso o "escondido antes de animar" só existe sob `.revelar`.

⚠️ **Os depoimentos fictícios SAÍRAM, e eram pedido do Victor (25/ago).**
Saíram pela direção nova: quatro falas inventadas com um aviso de
"pessoas fictícias" em cima são exatamente o que não tem cara de empresa
grande. Voltam quando houver depoimento real, com nome e autorização — a
regra de 25/ago continua valendo para quando voltarem. **A cena desenhada
do carro também saiu** (`ligarCena`, `.hcena`, `.hh-van`): era noite e
praia, a mesma família da foto que ele recusou; a van agora vive no bloco
"Passe o carro".

O menu da home virou **Como funciona · Recursos · Planos** (`#h-rec` é o
bento). Os planos da home têm até 4 itens por cartão; a lista do Premium
continua igual a `PLANO_DET.premium`.

### A dieta de texto no app

1. **`ligarNotasVivas()`** — as notas de regra que as telas DESENHAM depois
   do arranque passaram a recolher com o "Como funciona" da tela, como as
   que já existiam. Só onde a tela tem o botão (nota recolhida sem porta
   seria informação perdida); roda no callback do `MutationObserver`, antes
   da pintura, então nada pisca.
2. **Vitrines trancadas** (`painelTrancado`, `painelTrancadoFreela` e as
   cinco chamadas): título "X é do Volante/da Estrada", uma linha, até 3
   itens, o preço. Saíram as duas notas de rodapé (a conta Volante × Frota
   é dita na tela de assinatura, na hora de escolher), o link de taxas e a
   lista longa da Estrada que repetia os itens.
3. **Cartão de proposta**: os avisos viraram uma frase cada, e a nota
   "responder rápido alimenta o responde em" — repetida em TODO cartão —
   saiu.
4. Planos (escada e "o que nenhum plano compra"), Porta-malas (as quatro
   razões), Jobs, Agenda, perfil de quem contrata e Cofre: uma frase onde
   havia três.

⚠️ **AS FRASES QUE FICAM, e por quê — as suítes guardam cada uma:**
o banner de demonstração de cada tela (regra nº 6); "Nada de dinheiro
dentro do Cofre" **com os verbos** "não recebe, não guarda" (linha
regulatória); no Porta-malas, "API oficial do Google Drive" e "a plataforma
não guarda o seu material" (o desenho real dito na cara); "não está à venda
em plano nenhum" e "posição na busca" (regra dura); "o degrau de cima já
traz o de baixo"; "já traz a Estrada dentro"; "Nada em movimento"; "sem o
zip" e "MD5". **Encurtar é permitido; tirar a afirmação, não.** Na primeira
passada eu cortei três delas, e as suítes `cofre`, `porta-malas` e `take`
reprovaram — com razão. Voltaram curtas. A bateria completa pegou mais
uma: "Esta lista é sua — só você vê" (`lista-equipamento` cobra que a lista
diga na cara que é individual).

⚠️ **`densidade` foi para a origem http** (`_servir.js`): reprovou na
bateria e passou sozinha, depois de um `reload` em `file://` — o mesmo
flake de localStorage que já tinha levado `orcamento` e `explicador`.


## 19/out · 5 — o carro sai de onde estaciona e dá uma volta só

Victor, vendo o vídeo da 19/out · 4: *"O carrinho pode começar no ponto final
já, roda 360º só. E a linha rosa e azul vai revelando conforme ele vai
passando."* Até aqui ele saía das 12h e andava 402° (uma volta e mais 42°,
até estacionar). Agora:

- **A pose de espera é o lugar onde ele estaciona** (42°, alto à direita),
  e a volta é de 42° a 402° — termina onde começou.
- **O anel nasce em 42°**: as duas janelas das meias-tampas giram 42° em
  volta do CENTRO DO DISCO (`transform-origin` em 0 56px e 56px 56px). O
  truque não muda — cada tampa cobre meio anel e gira 180° —, só o ponto de
  partida.
- **Os quadros-chave saem de `src/quadros-abertura.py`** (a mesma
  cubic-bezier(.42,0,.2,1) por bisseção, 61 pontos, mais o quadro EXATO onde
  a viagem passa de 180°, aos 35,75%). Para mexer na curva ou no ângulo,
  gere de novo; nunca à mão.

⚠️ **A EMENDA DIAGONAL VAZA.** Em pé (12h e 6h) a borda das duas janelas
caía na grade de pixels; girada, ela é suavizada e o anel aparecia por um
fio entre as tampas — visto ampliado a 222°, na pose. Dois tampões da cor
do fundo (`.sp-tampao`, 4×10px) tapam o anel nas pontas da emenda: o de 42°
some quando o carro arranca (0,1s), o de 222° quando a viagem passa de 180°
(0,593s), com o carro em cima. Sobrepor as janelas não serve: depois da
meia volta a tampa girada apareceria na faixa sobreposta como um risco
escuro no anel.

`abertura` (39): a pose é a 42° (antes era 0°) e o último quadro com o véu
andando também — uma volta só. Vídeo: `abertura-19out-v5.mp4`.

## 19/out · 4 — a abertura espera o app montar, e anda mais devagar

Victor, com uma gravação de tela do iPhone (o app aberto pela tela de
início): *"Bug da animação inicial, e tá muito rápido. Precisa ser mais
lento e mais fluido."* Quadro a quadro, a 20 por segundo: o disco parado
**~0,5s** com o carro no alto e sem anel, e então a volta inteira em
**~0,2s** — o carro do alto para as 7 horas num quadro só. Era o BOOT:
enquanto o script monta o app, o iPhone não avança a animação, e quando o
caminho fica livre ela corre para recuperar o relógio. O "muito rápido" era
em boa parte isso: a volta de 0,86s aparecia espremida em dois décimos.

**Reproduzido aqui**: Chromium com a CPU 6× mais lenta
(`Emulation.setCPUThrottlingRate`), lendo o ângulo da órbita a cada quadro
(`scratchpad/rev/lento.js`). O build antigo: 2,4s parado, depois um salto de
42° num intervalo de 2s. O novo: parado o mesmo tempo, e a volta inteira em
1,23s sem nenhum passo maior que 13°.

O conserto, em duas partes:

1. **A coreografia nasce PAUSADA** (`#splash:not(.anda) … {animation-play-
   state:paused}`) e o fim do boot põe `.anda` **dois quadros depois** de
   acabar. Até lá o disco fica em pose com o carro parado no alto — o que o
   iPhone já mostrava, agora de propósito. A entrada do disco (`spcena`) não
   espera: é ela que cobre o boot.
2. **Tudo 1,6× mais lento**: volta do carro 1,38s, barras aos 0,83/0,96/
   1,09s, brilho aos 0,93s, nome aos 1,18s, piso **1950ms** (a marca inteira
   fica ~0,3s na tela antes de sair), íris de **1s** (era 0,62) e o véu sai
   do DOM 1,5s depois. O som acompanha: rumor até 1,38s, buzina aos 1,12s.

⚠️ **O RELÓGIO DA ABERTURA É `window.__abertura0`** — o instante em que ela
saiu da pausa. Antes ele era o começo mais antigo das animações do véu, e
isso passou a mentir: a entrada do disco começa no carregamento, as outras
só depois do boot. `correuAbertura()`, o toque que liga o som e a sonda da
suíte leem o `__abertura0`. Tocar na tela ANTES de o carro arrancar só
acorda o áudio; o som entra junto com a coreografia.

`abertura` (38) ganhou: nenhum quadro com a órbita fora do zero antes do
`.anda`, e o `__abertura0` depois do `__bootFim`. Mudaram de número, com o
porquê no comentário: o piso (1050 → 1950, e agora há teto: a saída não
espera à toa depois da coreografia), a buzina (0,70 → 1,12), o "cedo" e o
"tarde" do toque (120/860 → 190/1380) e o meio do íris (220 → 380ms).
`abertura-solta` espera o véu sair do DOM por 1,7s (era 1,1).

Vídeo de conferência: `scratchpad/ab/video194.js` (pose de 0,5s, a
coreografia no relógio dela, `finish()` e a saída).

## 19/out · 3 — o carro da abertura no lugar do botão Menu

**Enviada ao domínio em `146f63a`**, depois do "Pode subir" do Victor, com
bateria 86/86 e `--seco` antes. Conferido com `curl`: `VERSAO` 19/out · 3 no
app e na `/fase1`, o `.sp-orb{inset:-12.5px}` e o carro de 35,4px no HTML
servido, `/app/…` terminando na home e os cabeçalhos de segurança de pé.
Artifacts: completo v48, Fase 1 v25.

Victor, depois da 19/out · 2 no ar: *"A animação do início do site está com o
carrinho no local antigo."* Era a terceira cópia do mesmo disco com o mesmo
erro: o véu (`.sp-cena`, 104px) tinha a órbita do tamanho do disco e o carro
com 27% da largura, então ele andava EM CIMA do anel. Hoje é o botão escalado
de 50 para 104px: `.sp-orb{inset:-12.5px}`, carro de 35,4 × 20,8px com o topo
em −6,25px — centro a 1,16 raio, 34% da largura, as rodas pousando no anel
que ele vai desenhando. Conferido em quadro congelado: estacionado (alto à
direita) e no meio da volta (a ponta do anel debaixo das rodas).

⚠️ **O disco da casa mora em TRÊS lugares**: o botão Menu (`.mnb`, a
referência), o véu da abertura (`.sp-cena`) e o `src/emblema.js` (ícones e
cartão do link). Mexeu num, confira os outros dois. `abertura` 5d compara a
geometria do véu com a do botão pelo estilo computado; o emblema não tem
suíte que o compare, e foi assim que os dois erros passaram.

### O avatar do grupo do WhatsApp (`src/avatar.js`)

`node src/avatar.js <pasta>` gera `carro-do-freela-avatar.png` (2048, o
emblema a 68% para o carro caber no círculo que o WhatsApp recorta) e
`simula-whatsapp.jpg` (640px em JPEG, o que o WhatsApp faz com ela). Não sobe
para o domínio e não fica versionado. ⚠️ Victor: *"tá em baixa, o brilho tá
todo pixelado"* — degradê largo quase preto vira faixa em 8 bits, e o JPEG
alisa o grão que tentaria esconder; `filter:blur()` grande sai em blocos no
Chromium. Fundo liso, brilho só por degradê e só perto do anel. **Confira
sempre pela simulação em JPEG, não pelo PNG**: o PNG parecia bom.

## 19/out · 2 — revisão de segurança, bugs e o mapa da Fase 1 de verdade

Victor: *"Preciso que vc revise a plataforma inteira, melhore a segurança do
site, revise bugs, faça uma lista do que precisa aplicar pra fase 1 já
funcionar. Linkar pagamentos, contas Google pra conectar, criação das contas
de usuário funcionando."*

**Enviada ao domínio em `ac19160`**, depois do "Pode subir" do Victor, com
bateria 86/86 e `--seco` antes. Conferido com `curl`: `VERSAO` 19/out · 2 no
app e na `/fase1`; `/app`, `/app/CLAUDE.md`, `/app/src/template.html`,
`/app/src/crew.json` e `/README.md` terminam na home; `/CLAUDE.md` dá 404; a
CSP, nosniff, `X-Frame-Options`, Permissions-Policy, Referrer-Policy e COOP
saem na home; `og.jpg?v=3` e os ícones servidos byte a byte iguais aos
gerados. Artifacts: completo v47, Fase 1 v24. ⚠️ `curl` daqui às vezes volta
vazio ou com código 000 (a conexão cai): repetir antes de concluir qualquer
coisa. Falta o Victor ver no iPhone o ícone novo (tirar e pôr de novo na tela
de início) e o cartão no WhatsApp.

### ⚠️ O DOMÍNIO SERVIA A PASTA `app/` INTEIRA

O `publicar.js` espelha o fonte em `app/` no main (é o cofre contra reset),
e a Vercel publica a raiz do repositório: `carrodofreela.com.br/app/CLAUDE.md`,
o template, os testes e os documentos internos estavam abertos para quem
digitasse o caminho. **Duas travas, porque uma sozinha depende de um detalhe
da Vercel que não dá para conferir daqui:**

1. **`.vercelignore` em LISTA DE PERMITIDOS** (`/*` e um `!/<caminho>` por
   arquivo que o site serve), escrito pelo `publicar.js` a cada envio a partir
   dos alvos HTML + `ESTATICOS` + `m` + `vercel.json`. Arquivo novo na raiz
   não sobe até alguém dizer que sobe.
2. **Redirecionamento** de `/app`, `/app/:caminho*`, `/README.md` e `/README`
   para `/` no `vercel.json` (`permanent:false`). Redirect vale ANTES do
   disco na Vercel.

O `publicar.js` reprova se o `vercel.json` perder o redirect, o `noindex`, o
cache da `m/` ou algum cabeçalho de `FIXOS`.

### A CSP é CALCULADA, não escrita à mão (`src/seguranca.js`, `src/blindar.js`)

O app tem dois `<script>` embutidos; a política só deixa rodar script cujo
sha256 bate com o deles. Script injetado (XSS) e qualquer `onclick="…"` em
HTML montado por string deixam de rodar. Como o hash muda a cada build, ele é
tirado do arquivo que vai subir — **pelo navegador (`DOMParser`), não por
regex**: o template tem comentário com a palavra `<script>` dentro.

- `script-src 'self' <hashes>`, `connect-src 'self'` + **só** Web3Forms e o
  Supabase (`CONNECT`): **origem nova entra ali ou é bloqueada**, calada.
- ⚠️ **`'unsafe-inline'` FICA no `style-src`, de propósito**: o app inteiro
  pinta com `style="…"` montado em string. Estilo injetado não executa
  código.
- ⚠️ **O template tem ZERO `onclick="`** e precisa continuar assim — handler
  inline morre na CSP. O `.linkport` era o último (virou `aria-disabled`).
- ⚠️ **A CSP herda para o `about:blank` da folha de impressão e para
  documento `blob:`.** `imprimirFolha` foi testado servido com a política.
- **`node src/blindar.js <pasta>`** serve cada HTML com o cabeçalho de
  verdade (e a `m/` junto) num Chromium e exige a abertura inteira sem
  violação nem exceção. O `publicar.js` roda isso no clone e **política que
  quebra a página não sobe**. É a única passada que vê a página como o
  domínio entrega: as suítes abrem `file://`, onde cabeçalho não existe.
- Cabeçalhos fixos no `vercel.json` da raiz: nosniff, `X-Frame-Options: DENY`
  (+ `frame-ancestors 'none'` na CSP), `Permissions-Policy` (câmera,
  microfone, localização, pagamento, USB desligados), `Referrer-Policy:
  no-referrer`, COOP `same-origin-allow-popups`.

### Os filtros contra XSS, e a regra de onde cada um mora

| o que entra | passa por |
|---|---|
| URL em `src=""` (16 lugares) | `esc(urlSegura(x,true))` |
| URL em `url('…')` de CSS (39 lugares) | `cssUrl(x)` — escapa `( ) ' " \` e espaço |
| URL de link / `window.open` | `urlSegura(x)` (só http, https, file e caminho relativo; `blob:` e `data:` de mídia só com `midia`) |
| cor da guilda, do timbre | `corOk(c)` — só `#RRGGBB`, senão o ciano da casa |
| texto em `innerHTML` | `esc()` — nome de guilda, horário, função, estado de venda, nome de documento |
| célula de CSV | `celCSV()` — `'` antes de `= + - @` tab e CR (fórmula no Excel) |
| anexo de arquivo | `urlDoArquivo(f)` / `abrirArquivo()` — HTML, SVG e o resto que pode rodar código **baixa** em vez de abrir |

⚠️ **O anexo era o furo mais sério dos filtros**: um `.html` posto em
"Material do job" abria como `blob:` da MESMA origem, e rodava script com
acesso ao `localStorage` da conta. Hoje só abre na aba o que é PDF, imagem,
áudio, vídeo ou texto puro (`ABRE_NA_ABA`); o resto vira `application/
octet-stream` e baixa.

### Seis declarações que não sobreviviam ao recarregar

`PROD` (o perfil da produtora voltava a ser "Produtora Maré"), `FAV` (quem
se segue), `euCurti` (curtidas), `gcal`, `zap` e `zapJobs` entraram em
`DEPOSITOS`. É a regra de 12/set de novo: **estado que a pessoa declara
nasce em `DEPOSITOS` no mesmo commit.** `persistencia` passava à toa no
seguir — contava quantos favoritos havia, e o FAV semeado tinha o mesmo
tamanho; hoje confere pelo id.

### A Fase 1 prometia dinheiro DENTRO do app

A home da fase já era guardada pela `versoes`; dentro do app não era. Saíram
da Fase 1, cada um no lugar onde a função decide: o status de garantia
(`garStatus`), o depósito (`temDeposito`), "Em custódia" na agenda, o selo e
o "Sinal de 20% já reservado" nas propostas e na Sirene, o "pagamento
garantido" de Passar o carro, o cancelamento falando em sinal retido, o
comparativo de Montar equipe (que ainda trazia a coluna da Frota e
desalinhava — o cabeçalho filtrava os planos e as linhas não), os planos e a
assinatura vendendo taxa e Frota (`detPlano`, `abrirAssinatura` caindo no
Volante), o caixa aceitando pedágio e saldo (`pagamento()` com
`comMoedas=faseTem(2)`), o brinde de P$ 200 (`darPedagio` sai cedo), o
pedágio do `ACONTECE`, a pergunta 5 do cadastro ("Como você recebe" virou
"Como você se identifica"), os textos do brechó para quem compra e o
"Pagamento garantido" da página da produtora.

**Segunda passada, nos MODAIS** (a suíte varria só telas): a consulta
mostrava "Pagar com sinal e contrato" para quem aceita garantia (`c.gar` é
dado da Fase 2), o convite de quem chamou por fora oferecia o sinal
opcional, e a proposta aceita dizia "com o sinal retido". Os três passam
por `faseTem(2)`, e `fase1-sem-dinheiro` abre os três.

### ⚠️ A FASE SUBIU PARA O TOPO DO SCRIPT — o TDZ que derrubou o cadastro

O título da pergunta 5 passou a depender da fase, com getters, porque
`CAD_PERG` nasce antes de `FASE`. Só que quem LÊ o título é o
`montarFocoCad()`, e ele roda no meio do arquivo (~16.600), ainda na zona
morta do `const FASE` (~25.300): `Cannot access 'faseTem' before
initialization`. O erro caía no `try/catch` dele, o cadastro inteiro deixava
de virar perguntas, e **as duas suítes de fase passaram** — a nova lia o
título pelo getter, depois do arranque, quando ele já respondia certo. Quem
pegou foi `cadastro-foco`, na bateria.

Hoje `FASE` e `faseTem` moram na **primeira linha do script principal** (é
literal, sem dependência). Qualquer coisa avaliada no arranque pode chamar
`faseTem`. E `fase1-sem-dinheiro` confere o título NO CARTÃO montado, não no
objeto.

⚠️ **A lição: getter adia a leitura, não a avaliação de quem lê.** Antes de
contornar TDZ com getter, procure quem chama o getter, e quando.

### O carrinho do ícone e do cartão de link, no lugar do botão

Victor, com um print do botão Menu: *"O carrinho do Open Graph e ícone do
app estão diferentes. Deixe o carrinho no mesmo local da referência."* O
`src/emblema.js` dizia copiar o `.mnb` medida por medida, e não copiava a
órbita: no botão ela é 6px maior que o disco de cada lado (`inset:-6px`) e
o carro tem 17 dos 50px; no emblema a órbita era do tamanho do disco e o
carro 30%, então ele sentava EM CIMA do anel. Hoje é o botão dividido por
50 (órbita `-.12`, topo `-.06`, largura `.34`, altura `.2`, brilho `.08`).
Com o carro por fora, os ícones desceram para **76% do quadrado** (58% no
maskable, que o Android recorta num círculo de 80%), e os endereços
viraram `og.jpg?v=3` e `apple-touch-icon.png?v=2`: cartão novo, endereço
novo, senão WhatsApp e Safari mostram o guardado.

### O que não se lê daqui: o Supabase de produção

Conferir as políticas das tabelas `passos`, `cadastros` e `leads` com a chave
anon foi recusado pelo classificador (é leitura de produção). Está certo. A
consulta SQL para o Victor rodar mora no `docs/fase1-no-ar.html`, Parte 5.
O guia antigo (`docs/registro-supabase.html`) se perdeu num reset; o SQL da
`leads` está em `landing/README.md`.

### `docs/fase1-no-ar.html` — o mapa da Fase 1 de verdade

Publicado como artifact: `https://claude.ai/artifact/7WrPt9hnytjzwFeKZCFKcV`
(privado do Victor; para republicar de outra conversa, passe a URL no `url`).

Lista marcável (o que se marca fica no `localStorage` do aparelho), com a
etiqueta de quem faz (Você / Dev / Juntos). As peças: decisões do Victor
(Google só como login, o teaser da home com nomes, provedor, MEI, quem modera,
o que construir ou esconder), contas (Supabase Pro antes de abrir porque o
grátis pausa em uma semana; **Vercel Pro porque o Hobby proíbe uso
comercial**), o passo a passo do Google com os valores para copiar, e-mail e
senha no Supabase Auth com SMTP próprio, o banco com quem lê e quem escreve,
a cobrança do Volante por aviso do provedor (o navegador nunca decide que
alguém pagou), segurança, as promessas da tela que pedem servidor, a ordem e
o custo fixo (~US$ 45/mês). Preços conferidos nas páginas oficiais em 19/out,
com as fontes no fim.

⚠️ **As taxas do Asaas não puderam ser reabertas nesta sessão** (403 nas
páginas): os números são da pesquisa anterior e o documento manda conferir
na hora de abrir a conta. As do Mercado Pago não entraram — não foi possível
confirmar.


## 19/out · 1 — a abertura nova: o anel que o carro desenha, e o íris

**Enviada ao domínio em `2620cbd`**, depois do "Pode subir" do Victor, com
bateria 84/84 e `--seco` antes. Conferido com `curl`: `VERSAO` 19/out · 1 no
app e na `/fase1`, o raio do íris partindo de 8px no HTML servido, `noindex`
de pé. Artifacts: completo v46, Fase 1 v23. Falta ele ver no iPhone.

Victor: *"Mude a animação do início, pode ser mais criativo e com as cores
novas. Precisa ser rápido o início, o tempo suficiente pra carregar a
homepage."* Era ~3s (o carro atravessando, freando, a marca crescendo até
estourar a tela). Agora é ~1s, e o emblema é o **disco do botão Menu** —
o mesmo do ícone do app e do cartão do link:

| tempo | o que acontece |
|---|---|
| 0,00 | o disco escuro entra |
| 0,06 | o carrinho dá UMA volta e o anel azul e rosa nasce atrás dele; o anel fecha aos ~0,60s e o carro desliza até estacionar (0,92s) |
| 0,52 | as três barras acendem, uma a uma (.34/.64/1) |
| 0,74 | o nome |
| saída | o anel abre como o **diafragma de uma câmera** (íris de cinema) e a home aparece por dentro dele, com a borda nas cores do anel |

⚠️ **DURANTE O CARREGAMENTO SÓ ANIMA `transform` E `opacity`.** É o ponto
técnico que decidiu o desenho: enquanto a abertura toca, o navegador está
rodando o boot inteiro, e o que não é transform/opacity espera ele acabar
para pintar o próximo quadro — o anel engasgaria justamente na hora em que
existe para cobrir. Então o anel NÃO é desenhado por máscara animada: ele
já está pintado, e **duas meias-tampas da cor do fundo giram para longe
dele** (o truque do anel de progresso), no mesmo relógio e na mesma curva
do carro. As metades se encontram exatamente no centro: sobrepor um pixel
deixaria um risco às 12h e às 6h.

⚠️ **UMA CURVA SÓ, DO COMEÇO AO ESTACIONAMENTO** — Victor, vendo o primeiro
vídeo: *"tem um bug do carro, dá uma travadinha… pode ser mais suave o
tempo"*. A primeira versão era a volta em três trechos com curvas
diferentes: ao fechar o círculo o carro freava quase a zero e arrancava de
novo para estacionar, e no meio da volta uma curva de acelerar emendava
numa de frear com velocidade infinita nas duas pontas. Hoje a volta inteira
(0 → 402°) é `cubic-bezier(.42,0,.2,1)` em 0,86s, **amostrada em 61 pontos
mais um quadro-chave exato em 180° e em 360°** (sem eles, a tampa presa em
180 interpola diferente do carro e a ponta do anel se afasta dele ~10°). O
carro e as duas tampas andam pelos MESMOS pontos — cada tampa é o ângulo do
carro preso entre 0 e 180°. Medido a 60 quadros: a velocidade é um sino sem
parada no meio da volta (mínimo 1,1°/quadro) e sem degrau maior que
2,2°/quadro, e durante o desenho a ponta do anel fica a 0° do carro.
`linear()` com pontos faria o mesmo numa linha, mas não existe no Safari 16.
Os quadros-chave foram gerados por um script Python que resolve a
cubic-bezier por bisseção — para mudar a curva, gere de novo, nunca à mão.

⚠️ **A SAÍDA PODE PINTAR, porque quando ela começa o boot já acabou.** O
íris é o raio de um `radial-gradient` (`--sp-r`, registrado com
`@property` para transicionar), redesenhado a cada quadro: a borda fica
nítida até o fim. Escalar uma imagem pronta seria o serrilhado de 17/out ·
12 de volta. Sem `@property` (Safari antigo) o raio pula para o fim e o véu
sai pelo fade de opacidade que vem junto. Conferido no WebKitGTK: o raio
anda, o anel e as tampas desenham igual ao Chromium.

⚠️ **ANIMAÇÃO COM `forwards` CANCELADA NA MESMA HORA EM QUE A OPACIDADE
MUDA NÃO GERA TRANSIÇÃO** (medido: nenhuma `CSSTransition` nascia, e o
emblema ficava inteiro no meio do íris, como um fantasma, até o véu todo
sumir). A entrada da cena e do nome não seguram o fim: o valor base deles
já é o final, e a animação só pinta o começo (`backwards` no nome, que
espera a vez apagado). Aí a saída é transição de verdade.

⚠️ **O PISO CONTA DO COMEÇO DA ANIMAÇÃO**, não do script (`correuAbertura`).
E não lê UMA animação: a da cena e a do nome, sem preenchimento, SAEM de
`getAnimations()` quando acabam — o relógio voltaria a zero e o piso
contaria de novo no fim do boot. Conta-se da animação mais antiga do véu
que ainda vale. O piso é **1050ms**; se o boot demorar mais, a saída espera
o boot (medido aqui: ~1,3s depois do começo da animação).

- **O som** acompanha: o rumor enquanto o carrinho dá a volta (até ~0,86s)
  e a buzina distante aos **0,70s**, no quadro da barra cheia. Mesmos níveis
  calibrados de 25/ago; só o tempo encolheu.
- **Movimento reduzido**: o anel nasce inteiro, o carro não roda, a marca e
  o nome ficam parados, e a saída é fade simples (piso de 260ms).
- `abertura` mudou de números, não de garantias: piso 2950 → 1050, buzina
  2,24s → 0,70s, e a guarda da "travessia nítida" virou a do íris (o
  buraco é maior que o disco no meio da saída, nada do véu ampliado além
  de 1,1, o emblema já saiu de cima da home, a página não alarga). "Cedo"
  e "tarde" do toque se medem no relógio da animação.
- Um vídeo da abertura (quadro a quadro, 60 fps) foi feito para o Victor ver
  fora do domínio; o script mora no scratchpad (`ab/video.js`), o método é
  congelar as animações no primeiro quadro e andar o `currentTime`.

⚠️ **O HALO DO ÍRIS NASCE ESCONDIDO.** O raio parte de **8px**, não de 40:
a faixa colorida tem 44px, então em 8 ela termina em 52 — a borda do
disco — e no primeiro quadro da saída está inteira atrás dele. Partindo de
40 o halo rosa estourava para fora do disco num quadro só, um corte seco.
`abertura` 5c guarda a conta (raio + 44 ≤ raio do disco).

⚠️ **O "BUG" DO VÍDEO v2 ERA DO SCRIPT, NÃO DO SITE — e o Victor parou o
vídeo exatamente nele** (*"ainda tem bug"*): no começo da saída o carro
voltava ao topo, as barras sumiam e o nome piscava. O script fazia
`currentTime=1200; play()`, e **`play()` numa animação que já passou do
fim REBOBINA para o zero** (é a regra do auto-rewind) — a abertura tocava
de novo por baixo da saída. Hoje é `finish()`. Medido no site sem pausar
nada (`ab/real.js`, três aberturas, um registro por quadro): o carro fica
em 402° e a barra cheia em 1 até a saída. **Ferramenta que grava o que a
pessoa vai julgar precisa ser conferida como o produto** — o defeito do
vídeo vira defeito do produto na cabeça de quem vê.

## 18/out · 7 — o cadastro em foco, a home que volta inteira e o olho parado

**Enviada ao domínio em `62288b4`**, depois do "Pode subir" do Victor, com
bateria 84/84 e `--seco` antes, junto com o ícone e o cartão do link (abaixo).
Conferido com `curl`: `VERSAO` 18/out · 7 no app e na `/fase1`, `og:image`
em `/og.jpg?v=2`, os cinco PNG e o og.jpg servidos byte a byte iguais aos
gerados, o manifest com o maskable novo, `noindex` de pé. Artifacts:
completo v45, Fase 1 v22. Falta ele ver no iPhone: o cadastro, o ícone ao
compartilhar e o cartão colado no WhatsApp (que pode demorar a trocar o
cartão de quem já tinha o link).

Victor, com quatro prints (iPhone e Safari do Mac): *"No login quando clica
em mostrar senha, o ícone desce. Abriu normal a homepage, entrei na conta,
depois voltei pela logo… e bugou de novo o vídeo de background. Essa
experiência de preenchimento dos dados é péssima, muito texto de uma vez,
acaba fazendo a pessoa desistir… um item de cada vez na tela, no centro da
tela em foco e o resto desfocado. Mostrar o progresso que falta… frases de
impulsionar… um carrinho andando por cada etapa… Animações."*

### A home que volta pela logo

⚠️ **O `.entra` de `show()` animava a PRIMEIRA `.wrap` da tela com
`transform` — e na home ela é a caixa do texto do topo.** Transform faz da
caixa o bloco de contenção das camadas absolutas de dentro, e o `both` deixa
um transform neutro grudado nela depois da animação: a cena do vídeo
encolhia para a caixa do texto e ficava assim. Era o MESMO desenho do
defeito da · 6 (cena recortada na caixa do texto), por outro caminho — e só
aparecia voltando de dentro do app, porque a primeira abertura não passa
pelo `.entra`. Conserto: a home não recebe o `.entra` (ela tem as entradas
dela). `home-clara` mede o retorno: `show('planos')` → `show('home')` e a
cena continua do tamanho do topo, com `transform:none` na caixa.

⚠️ **Regra geral, irmã da da · 6: animação de entrada com `transform` não
mora em caixa que tenha camada absoluta de fundo dentro.**

### O olho da senha

O `button:active{transform:translateY(1px)}` global (a "pressão" da casa)
apagava o `translateY(-50%)` que centrava o olho — no toque ele caía meia
altura. Hoje o olho é centrado por `top:calc(50% - 21px)` e o `:active` dele
é só `scale(.9)`. `entrar` força o `:active` pelo CDP
(`CSS.forcePseudoState`) e mede que o centro não anda. **Botão centrado por
transform perde a centragem no global de pressão** — centre por `top`.

### O cadastro em foco (`montarFocoCad`, `CAD_PERG`, `test/cadastro-foco.js`)

Cada pergunta virou um **cartão** (`.cdq`): título curto, uma linha, o campo
e "Próxima". Uma em foco por vez, no meio da tela; as outras apagadas
(`opacity:.3`) e desfocadas (`blur(2.4px)`). No topo, grudado, o stepper e a
**estrada** (`#cd-via`): um ponto por pergunta da porta (7 na curta, 18 na
longa), o carro andando e a bandeira no fim, mais a conta "N de 7" com uma
frase de impulso.

⚠️ **É APRESENTAÇÃO, NÃO UM SEGUNDO FORMULÁRIO.** Os campos de sempre são
MOVIDOS para dentro dos cartões em tempo de execução: ids, handlers, o dado
(`EU.*`), as etapas e o stepper ficam onde estavam. Nada espelhado. A suíte
jura que cada campo existe uma vez só e mora dentro de um cartão. Feito em
tempo de execução pelo mesmo motivo da sanfona do Meu perfil.

⚠️ **O CARTÃO NASCE NO NÍVEL DA ETAPA (`.pn`), não dentro da linha.** Na
primeira versão o cartão entrava na `.cdrow.d2` da etapa 1 e virava célula
de uma grade de duas colunas: as perguntas saíam lado a lado. Linha que
fica vazia depois de mover sai do DOM.

⚠️ **SÓ OPACIDADE E DESFOQUE, NUNCA TAMANHO, e nada de `pointer-events:none`.**
Escalar a pergunta fora de foco mudaria a caixa de cada campo e todo clique
esperaria a animação; e tocar numa pergunta apagada é o jeito de trazer o
foco para ela. Foco vem de três lugares: o **clique** (depois do clique,
não no `pointerdown`, senão a rolagem anda entre apertar e soltar), o
**`focusin`** por teclado, e o **`change`** — escolher numa lista ou marcar
uma caixa de uma pergunta apagada é estar nela (o `selectOption` do
Playwright não clica, e foi assim que a suíte achou a falta).

⚠️ **O CARRO ANDA PELO QUE FOI RESPONDIDO, não pelo que foi visto**
(`pergFeita`: o `ok()` de cada pergunta, lido do `EU`). Pergunta opcional
(o que a função não conta, agenda, um trabalho, o destaque) conta quando a
pessoa passou por ela — senão o carro ficava parado esperando o que ninguém
exige. Andar toca `som("leve")`; chegar, `som("conquista")`.

⚠️ **A FRASE NÃO PROMETE O QUE NÃO É**: *"Você já aparece na busca"* só sai
com `perfilPronto()` verdadeiro — a suíte confere que antes da primeira
função ela não diz isso.

- **Enter e "Próxima"** levam à seguinte; a última da etapa vai para a
  etapa seguinte já em foco; a última da porta curta leva até "Concluir e
  entrar" e põe o foco nele, **sem apertar o botão por ninguém**.
- **Tocar num ponto da estrada** abre a pergunta (e a etapa dela).
- **A dieta de texto**: o parágrafo longo de cada etapa (`.pn>.lead`) e as
  notas soltas saem de vista no modo foco; a lista do que falta no perfil
  recolhe atrás de **"Ver o que falta no perfil · N"** (`#cd-falta-tog`). O
  aviso de "começando do zero" virou uma frase.
- **A pergunta do WhatsApp diz na cara** que o número não aparece para
  ninguém — é a restrição nº 1 dita a quem digita.
- O topo é sólido até depois da frase "N de 7" (com o degradê começando
  antes, a pergunta desfocada aparecia atrás do texto — visto na foto).
- `porta-e-tabela` passou a abrir o `#cd-falta-tog` antes de usar a lista
  do que falta: é o que a pessoa faz agora (mudança de produto, comentada).

### O ícone e o cartão do link: o disco do Menu (19/out)

Victor: *"Gera uma nova imagem para o open graph e o ícone do app
compartilhado do Safari, pode se basear um pouco no ícone do menu do
mobile."* Desenhados em código, sem crédito do Higgsfield.

- **`src/emblema.js`** desenha o disco do botão Menu em qualquer tamanho:
  o anel na mesma `conic-gradient`, o disco escuro, as três barras e o
  carrinho estacionado a 42°. ⚠️ **Em HTML e CSS, não em SVG**: o SVG não
  tem `conic-gradient`, e o anel sairia em gomos. Mexeu no `.mnb` do
  template, mexa no emblema junto.
- **`node src/icone.js`** → `apple-touch-icon.png` (180), `icone-192.png`,
  `icone-512.png` e **`icone-maskable.png`** (novo). No ícone o disco ocupa
  80% do quadrado e a marca 62% do disco (no botão são 52%): a 60px, que é
  o tamanho real na tela de início, as barras do tamanho do botão viravam
  um risco. Visto numa prévia com o canto do iOS antes de fechar.
- ⚠️ **O maskable é arquivo próprio, com o disco a 62%.** O Android recorta
  num círculo de 80% do lado, e o carrinho mora na BORDA do anel: no
  tamanho do ícone comum ele perderia a ponta. O manifest aponta o
  `maskable` para ele.
- ⚠️ **As barras terminam no CIANO DA MARCA**, não no ciano-claro do botão:
  o ícone é visto sozinho, sem a barra em volta para dizer de quem é.
  `tela-de-inicio` mede o ciano no pé da barra cheia, em (105,100). O
  ponto antigo (120,90) cai no disco escuro.
- **`node docs/gerar-og.cjs`** → `public/og.jpg` (1200×630, ~85 KB). O
  script não existia mais, embora o build e a suíte o citassem. A manchete
  e a sub saem do que a home já diz (`FASE_HERO[0]` e `[1]`), com o fim
  no degradê da marca, e o selo **Prévia** ao lado do endereço. ⚠️ **Nada
  de dinheiro na imagem**: o mesmo cartão serve à `/fase1`, que não tem
  sinal nem garantia. As fontes são as da casa, e o script reprova se elas
  não carregarem.
- ⚠️ **O endereço da imagem é `/og.jpg?v=2`** (`OG_IMG` no build). O
  WhatsApp guarda o cartão pelo endereço da imagem: sem trocar, quem já
  recebeu o link continua vendo o velho. Cartão novo, `v` novo.
- ⚠️ **O `og.jpg` passou a subir pelo `publicar.js`** (`ESTATICOS`, junto
  com o maskable). Até aqui ele morava só na raiz do main, subido à mão, e
  um cartão novo nunca chegaria ao domínio.
- ⚠️ Um `<link rel="icon" href="/icone-192.png">` foi tentado e saiu: em
  `file://` o caminho absoluto não existe, e `versoes` e `cartao-do-link`
  reprovam pelo erro de console. Não era o pedido. Quem o Safari usa ao
  compartilhar é o apple-touch-icon.

⚠️ **Armadilha de teste: `html{scroll-behavior:smooth}` faz o
`scrollIntoView` padrão ANDAR.** Medir `elementFromPoint` logo depois mede
no meio do caminho e reprova sem defeito. Nas sondas, `behavior:'instant'`.

## 18/out · 6 — a cena da home no Safari, e o login que sobe abrindo

**Enviada ao domínio em `5e0a8e6`**, depois do "sobe" do Victor, com bateria
83/83 e `--seco` antes. Conferido com `curl`: `VERSAO` 18/out · 6 no app e na
`/fase1`, o `z-index:auto` da cena no HTML servido, `noindex` de pé.
Artifacts: completo v44, Fase 1 v21. Falta ele ver no Safari — é o único
lugar onde o recorte acontecia.

Victor, com um print do Safari no Mac: *"bug"* — a home com a metade de cima
PRETA e o vídeo só atrás da manchete, da busca e dos botões; a faixa de
recursos embaixo também no preto. Depois, no meio da leva: *"na página de
login, a aba de login pode estar um pouco mais em baixo, e subir abrindo a
caixa em motion, de forma fluida, o que acha?"*

### ⚠️ Agora dá para abrir a página num WebKit aqui

O Chromium deste container não tem os defeitos do Safari, e o Playwright só
tem Chromium (não rodar `playwright install`). **O WebKitGTK tem o mesmo
WebCore do Safari** e sai do apt do Ubuntu:

```
apt-get install -y --no-install-recommends gir1.2-webkit2-4.1 python3-gi python3-gi-cairo xvfb xauth
xvfb-run -a /usr/bin/python3.12 -I wk.py URL LARGURA ALTURA ESPERA saida.png "JS"
```

- ⚠️ **`python3.12`, não `python3`**: o `python3` do PATH é o 3.13 de
  `/usr/local` e o binding do gi é compilado para o 3.12 do sistema.
- ⚠️ **Servidor COM Range**: o `http.server` do Python não responde Range, e
  sem isso o WebKit nem tenta o vídeo. O script do scratchpad
  (`scratchpad/wk/srv.js`) responde Range, como a Vercel.
- ⚠️ **Ele NÃO toca o vídeo** (falta o motor de mídia nesta build) e desenha
  um quadrado escuro no canto de cima que não é elemento nenhum — o print do
  Victor não tem. Serve para layout e para zoom, não para composição de vídeo.
- Os scripts (`wk.py` sem aceleração, `wkhw.py` com aceleração e um JS que
  roda antes de medir) moram em `scratchpad/wk/`; o container leva os dois
  num reset, o método fica aqui.

### A cena recortada na caixa do texto

O print do Victor (extraído da conversa, já que o resumo não guarda imagem)
mostrou o desenho exato: a cena ocupava **a caixa da `.wrap` do texto** — a
largura inteira, do título até a prova "34 livres hoje" — e nada fora dela.

⚠️ **A causa: `.hero .wrap{position:relative;z-index:1}`.** A primeira `.wrap`
do topo é `position:static` (para a cena se posicionar pelo `.hero`), mas ela
é **item de flex**, e em item de flex `z-index` vale mesmo com
`position:static`. Ela virava um contexto de empilhamento, e a cena
(`z-index:-1`) morava DENTRO dele. No Safari, com o vídeo tocando numa
camada composta, a cena saía recortada naquela caixa. O Chromium não recorta,
e o WebKitGTK (sem vídeo) também não — **por isso o defeito passou por toda
a bateria**.

Conserto: `.hprod>.wrap:first-child{z-index:auto}`. Sem contexto ali, a cena
pertence ao do `.hero` (`isolation:isolate`), que tem o tamanho da tela.

⚠️ **A guarda é sobre o MECANISMO** (`home-clara`): a cena tem o tamanho do
topo E nenhum ancestral entre ela e o `.hero` cria contexto de empilhamento
(z-index em item de flex, opacidade, transform, filtro, isolation, contain,
máscara…). Semeada contra o CSS antigo, ela reprova apontando a
`wrap hp-grade`. **Regra geral: camada de fundo com `z-index` negativo não
mora dentro de caixa que crie contexto próprio.**

### O zoom e o `svh` no Safari

Abrindo no WebKit a 1920 e 2560 de largura apareceu um segundo defeito, de
monitor grande: a cena acabava a 70% da altura (1013 de 1440px) e a prévia de
gente subia para a primeira tela. O Safari não multiplica `svh` pelo zoom do
corpo, e a divisão por `--zoom` encolhia tudo. Hoje `--zoom` é medido (ver
"zoom muda o significado de 100vh", acima): no Chromium continua igual ao
zoom, e no WebKit vira 1 — a cena vai de 0 a 1440 e a tela de entrar até o
pé da janela. O Victor não via este porque no MacBook o zoom é 1.

### O login mais embaixo, que sobe abrindo

| estado | o que se vê |
|---|---|
| longe | o vidro compacto (marca, título, frase e a pílula **Entrar**) desce `--lgn-desce` — o centro dele fica a ~47% da altura da janela |
| perto | o vidro, a marca, o título e a pílula **sobem juntos** com a mesma curva (0,82s, `--lgn-sobe`) enquanto o vidro cresce para os dois lados; a chave e os campos entram depois, subindo |

- ⚠️ **Quem anda é o que se vê, não o que se toca.** Campos, chave e botões
  ficam parados no lugar final o tempo todo: cartão andando embaixo do cursor
  faz errar o clique, e o Playwright confere o alvo antes de mover o mouse. O
  cabeçalho que desce passa POR CIMA dos campos transparentes com
  `pointer-events:none`.
- ⚠️ **`top`, não `translate`**: o vidro anda por `top`, e no Safari com zoom
  o translate não conta na mesma unidade (a lição da pastilha). O quanto desce
  é medido NA TELA e convertido por uma sonda de 100px de CSS dentro do cartão
  (`.lgn-sonda`) — offsetTop e tela também não batem no Safari com zoom.
- A chave e os campos entram com atraso (0,2s em diante): sem isso a frase
  cruzava a chave freela/contratante no meio da subida (visto em quadro
  congelado, não em asserção).
- `entrar` ganhou: compacto mais embaixo (centro entre 36% e 56% da altura),
  título e pílula dentro do vidro, o título colado no vidro aberto e fechado,
  e o vidro de volta ao topo do cartão quando abre.

## 18/out · 5 — a 75%, a pastilha no Safari, três planos, o login que abre perto e a mídia mais nítida

**Enviada ao domínio em `0bacd69`**, depois do "pode subir dominio" do
Victor, com bateria 83/83 e `--seco` antes. Conferido com `curl`: `VERSAO`
18/out · 5 no app e na `/fase1`, a carona nova (15,4 MB) servida com
`immutable`, `noindex` de pé. Artifacts: completo v43, Fase 1 v20. Falta ele
ver no Safari (a pastilha da lateral é o que só o aparelho dele confirma).

⚠️ **Créditos: o Victor disse NÃO** (*"n quero gastar creditos do higgs"*).
Os objetos 3D um por imagem e o 4K dos vídeos por IA ficam de fora até ele
trazer o assunto de volta — não oferecer de novo a cada leva.

Victor, depois da 18/out · 4 no ar, com três prints e um vídeo de referência
(uma tela de login "Flow"): *"1 — o ideal é o preenchimento como se a tela
tivesse em 75%, tava em 100% aqui e ficou muito exagerado. 2 — tem uns bugs
na aba. 3 — os vídeos da homepage e do login ainda em baixa qualidade… os
elementos em 3D também. 4 — os planos na homepage podem ficar só 3 com o
toggle. 5 — a aba de login menorzinha, e quando o mouse chegar perto ela
expanda… o carro também tá muito na ponta."*

### 1. O zoom a três quartos

A régua foi de 1300 × 760 para **1733 × 1013** — exatamente 0,75 do zoom
anterior. Abaixo de 1733px de largura o zoom é 1 (o desenho original); num
monitor de ~2048px ele dá ~1,18 em vez de ~1,57. A altura efetiva continua
acima de 760, então a tela de entrar segue cabendo.

### 2. A pastilha da lateral no Safari

O print mostrava o realce de "Planos" uma linha ACIMA do item. No Chromium
ela casa em toda largura — o defeito não se reproduz aqui. ⚠️ **O motor antigo
de `zoom` do WebKit não conta `offsetTop` na mesma unidade em que aplica o
`translate`**, e a pastilha era posta por `translateY(offsetTop)`. Agora
`moverIndLado()` mede no próprio lugar: uma sonda invisível (`.tabsonda`,
absoluta, `top:0`, dentro da lateral — a mesma âncora da pastilha) diz onde
o translate 0 cai e quantos pixels de tela vale um pixel de translate.
Funciona em qualquer motor e qualquer zoom. E a pastilha se recoloca quando
o zoom muda (o `z()` chama `moverInd`), quando a lateral muda de tamanho
(`ResizeObserver`) e quando a fonte chega.

⚠️ `doca` e `menu-recolhivel` liam `offsetTop` dentro do `style.transform`
— testavam o mecanismo, não o resultado. Passaram a comparar a pastilha e o
item **na tela** (`getBoundingClientRect`, ±1,5px), com o porquê no comentário.

### 3. Três planos com a chave, no computador também

O `#hp-pl-lado` saiu de dentro do `max-width:820px`: a chave **Sou freela ·
Quero contratar** vale em toda largura e mostra três cartões por vez. Os seis
continuam no documento (`premium-contratante`, `versoes` e `cara-de-empresa`
leem todos). `home-clara` ganhou a asserção do desktop.

### 4. O cartão de login que abre quando o cursor chega perto

| estado | o que se vê |
|---|---|
| longe (> 210px do cartão) | o vidro encolhido: a marca, o título, a frase e a pílula **Entrar ⌄** no lugar da chave freela/contratante, com um halo ciano |
| perto (< 120px) | o vidro cresce para baixo (0,62s, mola) e os campos entram um a um (`.lgn-entra`, `--i`) |
| preso aberto | foco dentro, texto num campo, aviso à vista, ou modo "Criar conta" |

⚠️ **QUEM ENCOLHE É O VIDRO, NÃO O CARTÃO.** O fundo saiu do `.lgn-cx` para
uma camada própria (`.lgn-fundo`, `z-index:-1`, com o fio girando no
`::before`), e é a ALTURA dela que anda. Os campos ficam no lugar, só
transparentes. Três razões, e a terceira é a que obrigou o desenho:
1. nada pula de lugar quando ele abre;
2. o teclado abre o cartão (o foco entra num campo invisível e ele abre);
3. ⚠️ **o Playwright confere o alvo ANTES de mover o mouse** — o
   `setupHitTargetInterceptor` faz um `expectHitTarget` preliminar. Com um
   cartão de altura de verdade e `overflow:hidden`, ou uma pílula por cima da
   chave recebendo toque, as 73 suítes que entram pelo login esperariam para
   sempre por um campo que só abre com o mouse perto. Por isso a pílula é
   `pointer-events:none` e nada cobre os campos.

- A distância é medida até o cartão INTEIRO, não até o vidro compacto: o
  cursor não consegue chegar a um campo invisível sem antes abrir o cartão.
- Só onde há cursor (`hover:hover` + `pointer:fine`, ≥821px). No celular o
  cartão nasce aberto e fica assim.
- `lgCartao.preparar()` roda no `show("entrar")`: compacto, a não ser que o
  cursor já esteja perto.
- ⚠️ **No desktop o fundo do `.lgn-cx` é `none`** — a auditoria de contraste
  sobe até o `.lgn` (que tem `--grafite`) e mede ali. No celular o cartão
  segue com o fundo dele.
- **O lugar**: *"não precisa ficar muito lateral"* — a margem direita foi
  de `clamp(20px,2.2%,40px)` para `clamp(40px,7.5%,150px)`.

### 5. O carro volta para longe da borda

A ampliação `--k` com o vídeo alinhado à direita (18/out · 3, para a ponte
sair de baixo do cartão grande) empurrava o carro para a ponta esquerda.
Com o cartão compacto o Victor liberou o fundo — *"veja o melhor lugar sem
precisar pensar no bg"* —, e o vídeo voltou a `cover` centrado
(`50% 58%`): o carro fica entre ~16% e ~48% da largura. `entrar` trocou a
asserção da ponte por "o carro a pelo menos 10% da borda", com o porquê.

### 6. A mídia mais nítida — o que foi de graça e o que custa

**De graça, feito:**
- **Vídeos `@hd` refeitos dos originais do Kling** (30 Mbps): a carona em
  CRF 19 teto 8M (~15 MB, era 9 MB — ⚠️ 12M dava 23 MB e o artifact recusa
  arquivo acima de 16 MB; o teto de 8M fica a SSIM 0,98 do de 12M) e o login em CRF 18 teto 12M (~6,6 MB,
  era 2,6 MB), os dois com nitidez leve (`unsharp=5:5:0.45`). Os quadros
  parados e os pôsteres em WebP q90. Comparado quadro a quadro: palmeiras e
  textura do asfalto aparecem onde antes havia borrão de compressão. Montagem
  em `scratchpad/v185/vid/ciclo2.py` (o `ciclo.py` com o `unsharp`).
- **Objetos 3D com `nlmeans` (s=3) e WebP q92.** ⚠️ **O defeito deles NÃO
  era resolução** — o arquivo já é 1,7 a 2,5× maior que o tamanho na tela de
  Retina. Era a FONTE: cada objeto nasceu numa folha de seis ou nove e foi
  ampliado por IA, e a ampliação deixou uma textura manchada (visível na
  folha 4K em PNG, antes de qualquer WebP). O `nlmeans` limpa as manchas e
  mantém a borda. Script: `scratchpad/v185/obj.py`.

**O que custa, e espera o aval do Victor** (a regra: crédito só com o custo
dito antes):
- **Objetos 3D gerados um por imagem**, cada um ocupando o quadro inteiro:
  GPT Image 2.5, fundo transparente, 2K alta = **2,75 cada** (4K = 4,25).
  São 21 objetos + o topo antigo.
- **Vídeos ampliados por IA para 4K** (Topaz/Bytedance no Higgsfield): é o
  único jeito de passar do teto do Kling, que é 1080p — num Retina de 2048px
  o navegador estica o 1912 a 2,1×. ⚠️ **A ferramenta de ampliar vídeo não
  dá o preço antes de rodar** (não tem `get_cost`), e o histórico não tem
  nenhuma ampliação de vídeo para servir de régua.

## 18/out · 4 — o desktop enche a tela: zoom pela janela e a home da Artlist

**Enviada ao domínio em `47ad7e9`**, depois do "Pode" do Victor, com bateria
83/83 e `--seco` antes. Conferido com `curl`: `VERSAO` 18/out · 4 no app e na
`/fase1`, `noindex` de pé. Artifacts: completo v41, Fase 1 v19. Falta ele ver
no computador.

Victor, com um print da home da Artlist: *"Quero que você faça isso pra o
desktop, que o site desktop preencha as páginas como na referência em anexo.
Identifique o tamanho da tela e se adeque a ela pra ter o melhor uso da
tela."* A referência: vídeo de borda a borda na primeira tela, barra
transparente por cima, manchete grande e centrada embaixo, uma fileira de
itens espalhada na largura inteira e o botão.

### O zoom deixou de ser degrau e virou conta

Os três degraus (1.1/1.2/1.3) paravam em 2100px: num monitor de 2560 sobravam
~370px vazios de cada lado. Agora:

```js
k = clamp(1, 2, min(innerWidth/1300, innerHeight/760))   // 3 casas
body.style.zoom = k>1 ? k : "";   html --zoom = k
```

- **Mora no `<script>` de dentro do `#splash`**, junto com o tema: no script
  do fim a abertura nasceria pequena e cresceria no quadro seguinte. Roda de
  novo no `resize` (`window.__zoomTela`).
- ⚠️ **A ALTURA ENTRA NA CONTA (÷ 760), e foi a bateria que mandou.** Só com
  a largura, 1920×1080 dava zoom 1,48 e uma altura EFETIVA de 730: a tela de
  entrar rolava, porque a media query compacta dela (`max-height:760px`) lê a
  altura REAL e não ligava. Com o piso, a altura efetiva nunca fica abaixo de
  760.
- ⚠️ **`svh` dentro de corpo com zoom é a janela REAL** — e a tela de entrar
  tinha 27 alturas em `svh` cruas. Todas viraram `calc(Nsvh / var(--zoom,1))`;
  o painel de suporte e o visor de foto do feed também.
- Medido: a 2560 de largura as telas de dentro vão até a borda (zoom ~1,97),
  sem rolagem lateral em nenhuma largura.

### A home: a primeira tela é a CENA, inteira (≥821px)

| peça | como |
|---|---|
| cena | `.hero.hprod` com `min-height:calc(100svh / var(--zoom,1))`, o vídeo em `inset:0` e `margin-top:-63px` para passar por baixo da barra |
| barra | transparente sobre a cena (`#homenav:not(.densa)`): um degradê escuro em cima e os tokens de texto redefinidos claros; quando condensa volta a ser a de sempre |
| texto | desce para o terço de baixo, centrado; manchete em duas linhas (`max-width:21ch`) para não tampar o carro |
| busca | `#hp-busca` centrada, 720px, dentro da cena — é ela que cumpre a regra "a busca começa na primeira tela" |
| faixa | os cinco recursos em `space-between` na largura inteira, com a mesma folga lateral da barra |
| véu | escurece em cima (para a barra) e de baixo para cima (para o texto); o meio fica limpo |

`#h-jogo` (a prévia de gente) começa onde a cena acaba. No celular nada
mudou: a cena continua sendo a janela embaixo dos botões.

⚠️ **Quatro armadilhas desta leva, todas medidas antes do conserto:**
1. **Flex em coluna + `.wrap{margin:0 auto}` desliga o esticar.** A faixa
   ficava num miolo de 746px no meio da tela. `.hero.hprod>.wrap{width:100%}`.
2. **A cor herdada é COMPUTADA NO `body`.** Redefinir `--cal` na barra não
   pinta o texto que herda `color` — o nome da marca sumiu no tema claro. A
   barra transparente declara `color:var(--cal)` ela mesma.
3. **A auditoria de contraste mede a barra transparente contra o PAPEL da
   página**, não contra o vídeo: texto claro "sobre branco" reprovava. A
   barra ganhou o degradê como `background-image` — a auditoria pula fundo de
   imagem (é o que ela já faz com foto), e o degradê ajuda a leitura de
   verdade quando o vídeo clareia.
4. **O botão de suporte cobria o último item da faixa**, no canto de baixo à
   direita: o pé da cena tem 78px de folga.

⚠️ **`home-clara` mudou de regra, e é mudança de produto**: ela exigia
`#h-jogo` começando antes de 900px a 1440×900. Agora exige a cena cobrindo a
primeira tela inteira, `#hp-busca` cabendo inteira nela, e `#h-jogo` começando
onde a cena termina — com o pedido do Victor no comentário.

## 18/out · 3 — a logo que não saía, a carona num ciclo só e a ponte no login

**Enviada ao domínio em `6509591`**, depois do "Pode subir" do Victor, com bateria 83/83 e `--seco` antes. Conferido com `curl` no domínio: `VERSAO` 18/out · 3, o vídeo novo com `cache-control: … immutable`, sem `hp-intro` e sem o rótulo do login. Artifacts: completo v40, Fase 1 v18. Falta ele ver no Safari — a janela normal é a que travava.

Victor, depois da 18/out · 2 no ar, no Safari do Mac: *"traavado o site"* —
um print da abertura parada (a marca, o carro, o nome). Na janela anônima
*"abriu mas demorou na logo de inicio e travou nessa parte aqui do video"*
(o fim do mergulho, o carro de trás). E, na mesma rodada: *"escondendo a
ponte no fundo a aba de login e tira a mensagem que fica em cima de Olha o
carro do freela passando"* e *"o video da homepage, nao pode repetir cena,
usa as cenas com uma narrativa de ordem e depois volta pra cena inicial"*.

### ⚠️ A LOGO PARADA PARA SEMPRE: o boot com estado salvo não tinha rede

A diferença entre a janela normal e a anônima é o que a pessoa já tem
GUARDADO. Com `cdf-uso` salvo, o boot redesenha tudo com o que veio do disco
(`HAVIA_USO` → `aplicarModo … drawFeed … show(S.tab)`), e **a saída da
abertura mora DEPOIS disso, no fim do script**. Um erro qualquer nesse
redesenho — um dado de outra versão, uma API que o Safari não tem — aborta o
script inteiro, e a saída nunca é agendada.

**Reproduzido com o build exato do ar** (baixado do domínio, ver acima): com
um `cdf-uso` em que `POSTS` vira texto e a última tela é o Feed, o 18/out · 2
estoura `POSTS.filter is not a function` e fica na marca + carro + nome —
o print do Victor, quadro por quadro. A causa exata no aparelho dele não deu
para ver daqui; **o mecanismo é este, e ele existia desde 25/ago** (a 18/out
· 2 só mudou o que estava guardado).

O conserto, em duas alturas:
1. **O redesenho com estado salvo roda em `try`.** Quebrou, a página abre na
   home com o que deu para montar — tela meio montada é ruim, logo parada
   para sempre é pior.
2. **No topo do script, antes de qualquer linha:** erro não tratado com o véu
   de pé SOLTA o véu (`soltarAbertura`), e um teto de 9s solta de qualquer
   jeito. O erro fica em `ERROS_BOOT`.

⚠️ **E O ERRO VAI JUNTO NO RECADO DE SUPORTE** (`erros` nos dados enviados e
"erro no arranque: …" na linha "Vai junto" do painel). Foi o que faltou para
achar a causa sem pedir o console do Safari a ninguém. `test/abertura-solta.js`
jura os três casos (estado quebrado abre na home e anota; erro com véu de pé
solta o véu; arranque limpo não anota nada) — e contra o build do ar ela
reprova, que é a prova de que o caminho era esse.

### A carona num ciclo só — e era ali que o Safari congelava

O laço repetia imagem, e o Victor viu: **a perseguição e a entrada pela
janela começavam no MESMO quadro** (o quadro-âncora, SSIM 1,000 entre os dois
primeiros quadros), e as duas abrem com o carro se afastando. No ciclo isso
aparecia duas vezes — e uma terceira no fim da abertura.

Agora é **um arquivo só, em loop**, cada cena uma vez (`HOME_VIDEO.cenas`):

| cena | de onde | |
|---|---|---|
| o céu sobre a cidade → o mergulho até atrás do carro | p1, 1,25× → 2× | |
| a perseguição | chase 1–86, 1,25× | continua do quadro em que o mergulho termina — sem corte |
| ⚡ a porta do carona e a janela | p2 do quadro **32** em diante | o começo dele é o mesmo quadro da perseguição |
| o banco do carona | pov, 1,25× | p2 termina onde ele começa — sem corte |
| ⚡ de volta ao céu | | o flash da volta mora INTEIRO no fim do arquivo |

351 quadros, 14,6s. ⚠️ **O arquivo começa no TERCEIRO quadro do céu**: os
dois primeiros, clareados, são o fim do flash da volta. Assim a primeira
volta abre limpa sem `entra` nem `currentTime` — o `homeLacoNoPonto` saiu.
Montagem: `scratchpad/v183/sc/ciclo.py`. Leve 1024 CRF 31 teto 2M (2,4 MB);
`@hd` 1912 CRF 28 **teto 5M** (9,1 MB) — o teto (`-maxrate`/`-bufsize`) é
para o vídeo correr pela rede sem engasgar; contra 4M a diferença de SSIM
é 0,005, e qualidade era a queixa de antes.

⚠️ **A passagem entre dois `<video>` saiu junto, e era o congelamento.** A
abertura acabava e o laço, vindo da rede, ainda não tocava: o último quadro
do mergulho ficava parado na tela. Um arquivo só não tem passagem. O vídeo
ganhou o `poster` (o primeiro quadro do ciclo) para não mostrar nada antes
de chegar; o fundo da cena é o mesmo quadro; sem H.264 ou com o play
recusado, `homeDescansa()` põe o banco do carona.

⚠️ **"Cena repetida" não se mede por pixel aqui.** Os clipes mudam rápido
(SSIM 0,5 a seis quadros de distância), e o laço antigo e o novo ficaram a
0,04 um do outro no pior par a 3s — teste com esse limiar seria instável. A
suíte cobra a FORMA: um vídeo só, em loop, sem abertura separada, e a lista
de cenas sem repetição.

### A ponte no login, e sem rotulinho em cima da frase

O rótulo *"Agenda e contratação de equipe audiovisual"* saiu — o mesmo que
saiu do resto em 17/out · 14, e este tinha escapado. A frase fica sozinha.

⚠️ **A PONTE NÃO CABIA SÓ MUDANDO O ENQUADRAMENTO.** À direita das torres da
frente sobra um quarto do quadro, menos que o espaço do cartão: com o vídeo
em `cover` não existe posição que tire as torres de baixo dele. O que fecha
a conta:
- o **vídeo ampliado** (`--k` na `.lgn-cena`) e **alinhado à direita** — a
  caixa do vídeo é a cena × `--k`, encostada na direita e centrada na altura;
- o **cartão mais estreito e encostado na borda** (`clamp(320px,26%,400px)`,
  margem `clamp(20px,2.2%,40px)`);
- **`--k` por formato da janela**: 1,08 até 1,62; 1,12 até 1,72; 1,16 daí
  para cima (quanto mais larga, mais precisa crescer); **abaixo de 1,55 não
  amplia e não alinha** — ali a ponte não sai sem cortar o carro, e o carro
  vence. Do 16:9 para cima o pôster cresce pela largura.
- o **pôster de fundo** segue a mesma conta, para quando o vídeo não toca.

`entrar` passou a medir pela caixa do vídeo (não mais pela cena) e mede em
sete janelas: as torres terminam antes do cartão em 1280×720, 1440×900,
1470×870 e 1920×1080, o carro não encosta na borda em nenhuma, e a frase é
SÓ "Olha o carro do freela passando.". O "Quero contratar" ganhou
`white-space:nowrap`: no cartão de 320px ele quebrava em duas linhas.

### O cache da mídia

O domínio mandava `max-age=0, must-revalidate` em tudo, inclusive em `m/`,
cujos nomes já carregam o hash: toda visita revalidava cada vídeo e foto.
O `vercel.json` ganhou `/m/(.*)` com `max-age=31536000, immutable` e **passou
a subir pelo `publicar.js`** (antes morava só no main, sem dono), com trava:
sem o `noindex` ou sem o cache da `m/`, não sobe.

## 18/out · 2 — a mídia sai do HTML, em alta no computador

**Enviada ao domínio em `518c403`**, depois do "pode subir" do Victor, com bateria 82/82 e `--seco` antes (o ensaio já conferiu a `m/` com 100 arquivos e 22 MB). Os dois artifacts levam a pasta junto (`root: public` + `files` com os 100 caminhos de `m/`): completo v39, Fase 1 v17. Falta ele confirmar "18/out · 2" no pé do menu e ver no computador.

Victor: *"as imagens de vídeo geradas estão em baixa qualidade, tá péssimo
quando abro no computador, na verdade todas as imagens geradas estão em
baixa… quero ver em ótima qualidade."* Ele tinha razão, e a culpa era
minha, não do Higgsfield: para tudo caber num HTML só, eu encolhia.

| peça | original | o que estava no site | agora no computador (`@hd`) |
|---|---|---|---|
| carona da home | 1912×1080 | 1024×578 | 1912×1080 (CRF 26/28) |
| vídeo do login | 1912×1080 | 1600×904 | 1912×1080 (CRF 25) |
| fotos de cabeçalho (8) | 2688×1520 | 1280px, 20–39 KB | 2560px |
| objetos 3D (21) | folhas 2K | 360px (topo 1280) | até 1384px (folhas ampliadas a 4K) |
| brechó (9) | — | 560px | 1440px (refeitas em 2K) |
| capas por função (6) | folha 2K de 6 | 960px de um quadro de ~680 | 2400px (refeitas em 2K) |

**O desenho novo**, e ele não quebra a regra da casa (nada de fora):

- `src/midia/` guarda cada mídia em duas versões, `nome.ext` (leve) e
  `nome@hd.ext`. O build copia para `public/m/nome.<hash>.ext` — o hash faz
  o navegador guardar para sempre sem nunca servir um velho — e troca o
  `"midia:nome.ext"` dos JSON de assets pelo caminho. Nome que não existe
  **reprova o build**.
- `MIDIA_HD` (do build) liga a leve à `@hd`. No arranque, `qual()` decide
  UMA vez: mais de **1400 pixels físicos** de largura (`innerWidth ×
  devicePixelRatio`) leva a `@hd`; celular leva a leve — a janela do vídeo
  lá tem ~350px e o plano de dados é de alguém. Medido: no computador as 35
  mídias da home vêm em alta; no iPhone, as 35 leves.
- Cada constante de mídia nasce por `midia(...)` (`FOTOS`, `FOTO_CAT`,
  `HOME3D`, `LOGIN_VIDEO`, `HERO_ARTE`, `HOME_VIDEO`), que troca o caminho
  pela **URL absoluta** da versão certa. ⚠️ Absoluta de propósito: `img.src`
  e o fundo pintado comparam igual com o valor guardado (`entrar` compara o
  carro com `HOME3D.carro.src`).
- **Os vídeos tocam direto da URL** — `videoBlob` devolve a URL quando não
  é base64 (o Blob era para `data:`, que o Safari não toca em `<video>`). A
  abertura da carona é pedida ANTES do laço: com os dois vindo da rede, quem
  toca primeiro tem de chegar primeiro.
- **Rostos, fontes e ícones continuam embutidos**: são pequenos e mostrados
  pequenos.
- O HTML foi de **9,6 MB para 2,5 MB** — o site abre mais rápido em qualquer
  aparelho, e cada mídia só é pedida quando a tela dela aparece.

⚠️ **Três lugares tiveram de aprender que a página tem uma pasta ao lado:**
1. `test/_servir.js` serve `m/` (sem isso, toda suíte em http veria imagem
   quebrada e vídeo mudo);
2. `src/publicar.js` troca a `m/` INTEIRA na raiz do domínio e reprova se um
   dos sete HTML citar arquivo que não subiu; o espelho em `app/` não leva
   `public/m/` (é cópia do `src/midia/`, que vai);
3. o **artifact** publica a pasta junto (`files` com `m/...`).

⚠️ **Os testes que exigiam mídia embutida mudaram de regra, e é mudança de
produto**: `home-clara`, `entrar` e `cara-de-empresa` pediam `blob:`/`data:`
ou comparavam um trecho do base64 (`slice(30,90)`) — com URL curta isso
passaria à toa. Agora pedem o arquivo de `m/` certo e comparam a URL
inteira. O bloco do brechó da home confere as três FOTOS de categoria
(`img[data-cat]`); o objeto 3D do bloco é conferido com os outros.

### Como as mídias foram feitas (para refazer)

- **Vídeos**: dos originais do Kling (no scratchpad da sessão), mesma
  montagem da carona (`carona-laco4.py` com largura 1912) e o login nos
  quadros 1–120 de sempre.
- **Objetos 3D**: as folhas originais estavam no histórico do Higgsfield
  (`7acf4f85` 3×2, `3934ba1e` e `6bf191cc` 3×3, `a04d2389` o topo). Ampliadas
  a 4K no upscaler (2 créditos cada) — que devolve SEM transparência —, então
  a cor vem da ampliada e o **alfa da original ampliado**: a folha guarda cor
  por baixo do transparente, e o encaixe sai sem borda escura. Alfa abaixo de
  12 é zerado (sobra de reamostragem). Cada objeto foi achado na folha pelo
  contorno (24×24) contra o que estava no site: os 20 casaram, e os 4 que
  sobraram são os sem uso de 17/out · 4.
  ⚠️ Num teste de ffmpeg (`overlay` em fundo claro) aparecia um retângulo em
  volta dos objetos — era a montagem do ffmpeg, não a imagem: no Chromium
  sai limpo. **Confira transparência no navegador**, não no ffmpeg.
- **Brechó e capas** foram refeitos, uma imagem por foto em 2K, com a folha
  antiga de cada série como referência de estilo: o original não servia (a
  folha das capas tinha seis fotos em 2K — ~680px cada).

**Custo no Higgsfield**: 15 imagens (41,25) + 4 ampliações (8) = **49,25**.

## 18/out · 1 — a carona: a câmera entra no banco do carona

**Enviada ao domínio em `eab1054`**, depois do "Ótimo, pode subir" do Victor, com bateria 82/82 e `--seco` antes.

Victor, vendo o carro andando pela cidade: *"pensei aqui em uma opção de uma
câmera aproximando até o carro e entrando no banco carona. De alguma forma
cinematográfica… e rolar um loop do carro andando na cidade."* É o nome do
plano grátis virando imagem: quem chega na home pega uma **carona**.

| peça | o quê |
|---|---|
| **abertura** (`HOME_VIDEO.intro`, `#hp-intro`) | ~3,3s, toca UMA vez por carregamento: do alto da cidade, por TRÁS do carro, o drone mergulha até a altura do para-choque |
| **laço** (`HOME_VIDEO.mp4`, `#hp-video`) | ~13s: a câmera emparelha com a porta do carona e entra pela janela → o banco do carona → ⚡ → a perseguição baixa por trás → ⚡ (de volta ao começo) |
| `entra` | 2,5/24 s — onde o laço começa na PRIMEIRA vez (depois do flash da volta) |
| `poster` | o primeiro quadro da abertura (a cidade vista de cima e de trás) |
| `parado` | o banco do carona — onde a cena descansa: movimento reduzido, sem H.264, `play()` recusado |

### ⚡ A primeira versão andava de RÉ, e o Victor viu antes de mim

*"Parece que o carro tá dando ré… seja crítico na forma certa do
posicionamento do carro, movimento correto, local correto do passageiro. E
movimento mais dinâmico, ficou muito parado."* Medido depois, por **fluxo
por região** (`scratchpad/hero-gen/fluxo.js`: casamento de blocos, dx/dy
médio em cada pedaço da tela), e ele tinha razão nos três:

- **A ré.** A abertura começava com o carro vindo DE FRENTE para a câmera e
  terminava olhando para a frente de dentro dele. A câmera precisava dar
  meia-volta, e o Kling resolveu invertendo o mundo: ao lado do carro, o
  cenário corria para o capô. Dentro, o para-brisa dizia "para a frente" e a
  janela lateral dizia "ré", ao mesmo tempo.
- **O lugar.** A câmera estava colada no painel, na altura da saída de ar —
  câmera presa no painel, não gente sentada. Sem capô e sem faixa à vista.
- **Parado.** O laço tinha de terminar no mesmo quadro em que começava, e em
  5s o Kling resolveu isso quase sem andar (~6% da tela por segundo; a cidade
  e o retrovisor imóveis).

⚠️ **E o Kling erra a direção de novo se deixarem.** Na segunda leva, o banco
do carona saiu com os postes NASCENDO grandes na borda e encolhendo até a
ponte — ré — enquanto a janela lateral corria certo; a tomada lateral fazia
o carro escorregar para trás no quadro. As duas foram descartadas. O que
funcionou: **descrever o movimento como ele aparece NA TELA** ("os postes
nascem pequenos perto da ponte, crescem e saem pela borda esquerda; na
janela lateral, as casas correm da esquerda para a direita").

⚠️ **A trava antes de usar: fluxo por região, sempre.** Para a frente é:
para-brisa abrindo para fora (esquerda < 0, direita > 0), janela lateral
direita correndo para a direita (da frente para trás), chão descendo (vindo
para a câmera), painel ≈ 0. Qualquer região dizendo "ré" reprova a tomada.

⚠️ **A MÃO É A DIREITA.** O primeiro quadro de cima tinha o carro à esquerda
da faixa amarela (contramão), e o do carona tinha a faixa passando à direita
do capô. Os dois foram corrigidos editando o próprio quadro antes de animar.

⚠️ **O CARRO MUDA DE MODELO se não for ancorado.** Com o carro só no começo
(pequeno, de cima) e no fim (de dentro), o Kling foi trocando o SUV de
brinquedo por um sedã com placa à medida que a câmera chegava perto. O
conserto foi um **quadro-âncora no meio**: o carro de perto por trás, com
bagageiro, lanternas e sem placa — e a abertura em duas partes (cidade →
âncora → banco do carona). O mesmo quadro é o começo da perseguição.

### A montagem

- **A volta para dentro do carro é a própria entrada pela janela.** Victor:
  *"depois que vai acompanhar atrás do carro volta pro passageiro do nada."*
  A perseguição agora corta para a câmera atrás do carro, que emparelha com a
  porta do carona e entra — e essa tomada termina no quadro em que o banco do
  carona começa. Por isso a abertura é só o mergulho: a entrada mora no laço,
  e a primeira volta já a mostra.
- **⚡ Corte seco vira flash de 3 quadros**, pedido dele: o último antes do
  corte clareia (50% de branco), o do corte quase branco (90%), o seguinte
  clareia (45%). São dois: banco do carona → perseguição, e perseguição →
  entrada (este atravessa a volta do arquivo: o último quadro e os dois
  primeiros).
- ⚠️ **Por isso o laço começa em `entra` na primeira vez** (`homeLacoNoPonto`):
  a abertura termina atrás do carro, exatamente onde o laço começa, e ali não
  há corte — começar no quadro 0 seria piscar branco sem motivo. Medido: a
  passagem dá 0,515 contra 0,533 de um passo normal.
- **Rampas de velocidade**: mergulho 1,25× no alto e 2× na descida; o banco
  do carona a 1,25×; a aproximação do carro a 1,5×.
- **A perseguição é cortada no quadro 90**: depois disso a câmera ultrapassa o
  carro e ele sai pela direita.
- ⚠️ **`concat` do ffmpeg com trechos de UM quadro perde quadros** (a duração
  deles sai zero e o segundo flash sumiu). `setpts=N/24/TB` em cada trecho e
  depois da junção, e `-vsync passthrough`. Scripts: `scratchpad/carona-laco4.py`.

### O código (o mesmo desde a primeira versão)

⚠️ **(SUBSTITUÍDO em 18/out · 3: um vídeo só, em ciclo — a passagem entre os dois era onde o Safari congelava.)** **DOIS `<video>` EMPILHADOS, não um src trocado.** Trocar o src no fim da
abertura pisca preto. O laço espera carregado por baixo e a abertura só sai
de cima quando ele já está tocando (`play()` resolvido + um quadro). Medido
com uma cópia VP9 só no navegador de teste: zero quadros sem vídeo à vista.

⚠️ **A CARONA ESPERA O VÉU.** A abertura do site cobre os primeiros 2,9s;
quem dá a partida é a saída dela (`body.abriu` chama `ligarVideoHome()`). E
o laço também espera — `home-clara` pegou isso embrulhando
`HTMLMediaElement.play`.

- **Voltar à home não repete a abertura** (`HP_FASE`). Sair no meio pausa.
- **Peso**: abertura 0,68 MB + laço 2,16 MB, 1024×578 (CRF 30/31). O build
  ficou em **9,6 MB**. Os dois só viram Blob com a home à vista.
- `home-clara` (72) e `cara-de-empresa` aceitam os DOIS quadros parados como
  "a cena da casa" — mudança de produto, com o porquê no comentário.

**Custo no Higgsfield**: primeira versão 25,5 (descartada); a refeita 86,5
— 6 quadros (16,5), 3 tomadas descartadas (33,25: abertura com o carro
mudando de modelo, banco do carona de ré, lateral escorregando para trás) e
4 que entraram (36,75). **A leva de 17/out · 14 a 18/out · 1 gastou 165,75.**

## 17/out · 15 — as fotos do Higgsfield, a home no nível do login e o Menu sem quina

**Enviado ao domínio em `16a28b1`**, depois do "pode fazer tudo de uma vez já e subir no final" do Victor, com `--seco` antes e bateria 82/82; falta ele confirmar "17/out · 15" no pé do menu. **A carona (18/out · 1) NÃO foi junto** — precisa de autorização nova.

Victor: *"pode gerar no Higgsfield"* (as fotos de cabeçalho), depois *"a
homepage também precisa ficar à altura da área de login. Gera no
Higgsfield o que precisar… lembrar das fases… mas já gera a página
principal com todas as funções como é hoje"*, *"tem um problema no botão de
menu, visual mesmo"* e *"o vídeo da home tem que ser diferente do vídeo da
aba de login, pense numa opção legal e criativa"*.

### As fotos de cabeçalho (`src/assets/heroes.json` → `HERO_ARTE`)

GPT Image 2.5, 2K alta, **2,75 créditos cada**: Feed (cinegrafista em
silhueta na praia ao entardecer), Vagas (Fresnel no set com fumaça), Brechó
(lente de cinema), Jobs (claquete em branco num case, equipe ao fundo),
Guilda (equipe em silhueta contra a luz), Praças (a ponte vista de cima),
Aprender (oficina com câmera e caderno) e Coletivos (grupo em volta de um
monitor). **Sem rosto, sem marca, sem texto** — pedido no prompt e conferido
na folha. Webp 1280px q70, ~280 KB no total. `fotoDoTopo(nome)`: a foto
gerada vence a capa de ofício; o **Passar o carro usa o quadro do vídeo do
login** (custo zero). A foto se **dissolve no cartão por máscara**, não por
véu sólido: o véu começava em `--cine-bg` puro e, com foto clara, aparecia
uma emenda vertical.

### A home no nível da tela de entrar (`HOME_VIDEO`, `#hp-cena`)

O topo deixou de ser o objeto 3D solto e virou uma **cena**: a cidade
vista de cima, em maquete noturna — o mar à esquerda (é onde mora a
manchete), a ponte rosa e azul, e **o carro da casa passando com o rastro
ciano→rosa enquanto alfinetes de luz acendem nos telhados**: é o "Passe o
carro" contado sem texto. Quadro com o carro 3D como referência (2,75) +
Kling 3.0 Pro 5s sem som (8,75). O Kling devolveu uma **cena viva**: a
câmera fica parada, o carro na avenida, e o que mexe é o rastro correndo do
ciano ao rosa, os alfinetes pulsando e o mar quebrando — o laço fecha em
0,997 sem corte nenhum, e o vídeo pesa 343 KB. Se o Victor quiser o carro
andando de fato pela cidade, é outra geração (8,75).

⚠️ **A primeira cena foi descartada pelo Victor**: era o carro na orla com
a ponte e os coqueiros — o mesmo mundo do vídeo do login, e a home precisa
ser outra coisa. Custou 11,5 créditos que não entraram no produto.

- **Desktop**: a cena vai de borda a borda por trás do texto (quem
  posiciona é o `.hero`, a `.wrap` virou `static`), com véu até a manchete
  e fusão na página embaixo. Não passa de 84% da altura: a busca de baixo
  continua começando na primeira tela (`home-clara`).
- **Celular**: a cena vira uma **janela** no lugar da arte 3D, logo embaixo
  dos botões — por cima do texto ela brigaria com a manchete.
- **O topo é escuro nos dois temas** (cartaz): tokens de texto, botão e
  vidro redefinidos dentro de `.hprod`.
- Vídeo como no login: Blob uma vez (`videoBlob`), só toca com a home à
  vista, pausa ao sair, quadro parado sem H.264 ou com movimento reduzido.
- **Blocos** em cartão de cinema no escuro (brilho da cor de cada bloco), a
  **banda da praça** com a foto do coletivo e as miniaturas das fotos
  novas, e o **fechamento** sobre a ponte vista de cima, com o carro 3D.
- **Fases**: conferido bloco a bloco na `fase-1.html` — sem sinal,
  garantia, take, Guildas, nem Premium/Estrada/Frota; nenhuma imagem nova
  afirma função de fase futura (`versoes` 95/95).

⚠️ **Duas suítes mudaram de regra, e a mudança é do produto**: `home-clara`
e `cara-de-empresa` exigiam "a única imagem do topo é o objeto 3D". Agora
exigem que a única imagem do topo seja a **cena do carro** (`HOME_VIDEO`) e
que nenhuma foto de set ou de cabeçalho apareça ali — a regra de 17/out
("não condiz com o que quero") continua de pé, só mudou o que é permitido.

⚠️ **`abertura` media "tocar tarde" no relógio de parede**: 2,6s depois do
`load`. Com a página mais pesada o `load` chega mais tarde e a animação já
corria desde o primeiro quadro — o toque caía depois de o véu sair. Hoje o
"tarde" é medido no relógio do documento, contado do começo da animação do
carro (`document.timeline.currentTime - an.startTime ≥ 2450`). ⚠️ O
`currentTime` da própria animação NÃO serve: ela dura 1,8s e para no fim.

### O Menu: a lombada redonda, sem o corte em cima

Victor, com um print do iPhone: *"tem um problema no botão de menu, visual
mesmo"* — e depois, apontando: *"tá cortando em cima"*. O fio da lombada é
um `box-shadow` de 1px POR FORA do círculo, e o `clip-path` que a corta na
linha da barra começava em `inset(0 …)`, o topo exato da caixa: o fio do
alto ficava fora do recorte e sumia numa corda reta. **O recorte agora tem
3px de folga em cima e dos lados.**

⚠️ **Uma colina em svg foi tentada no lugar e o Victor recusou** (*"sujou
demais a imagem"*). Mostrei quatro saídas (flutuando, encaixe, na barra,
colina limpa) e ele escolheu a lombada redonda de antes, corrigida, com o
carrinho girando no anel como já girava. Não trocar o desenho sem ele.

### A moeda take de Planos

O objeto 3D do topo de Planos era uma moeda ciano com três riscos IGUAIS —
quem olha lê "take", e o símbolo do take são as três barras da marca
crescendo, num disco de alumínio. Victor: *"se a ideia for a moeda take,
então tá errado"*. Planos paga com take e pedágio, então a moeda fica, mas a
de verdade: `#cv-moeda-planos`, o mesmo `fabricarMoeda` da página do take,
girando só com Planos à vista (`montarMoedaPlanos`).

### A cena final da home: o carro andando

Ele viu a cena viva e pediu *"o carro andando pela cidade"*. Terceira
geração do Kling (8,75): o drone acompanha, a cidade passa por baixo, o
carro anda, o rastro desenha o caminho e os alfinetes acendem um a um. O fim
não casa com o começo (emenda 0,448), então o laço fecha com um **mergulho
de 0,45s no azul-noite** em cada ponta — corte de cinema, não pulo. 839 KB.
**Gasto total da home no Higgsfield: 31,75 créditos** (dois quadros e três
vídeos; entraram um quadro e um vídeo). Com as 8 fotos de cabeçalho (22), a
leva toda gastou **53,75**.

⚠️ `.hprod .hp-grade` reprovou na `colisao` (hp-grade é a segunda classe
do elemento): virou `.hprod>.wrap:first-child`.

## 17/out · 14 — o cabeçalho de cinema, o azul e o rosa, e sem rotulinho em cima do título

**Enviado ao domínio em `cb9d27d`, junto com a 17/out · 13**, depois do "pode subir" do Victor, com `--seco` antes e bateria 82/82; falta ele confirmar "17/out · 14" no pé do menu.

Três pedidos do Victor, com uma prancha das abas redesenhadas: *"os
coqueiros somem do nada no final do vídeo loop, deixe a homepage e as
páginas com as cores novas em detalhes. O azul e o rosa… Acho que nesse
estilo fica ótimo, pode aplicar nas páginas essas ideias."* E, no meio:
*"pode tirar essas frases que ficam pequenas em cima do título da página,
isso é muito cara de IA e tem isso em tudo, até na homepage"* e, sobre o
"Quem eu sigo": *"essa aba é muito simples, tem outras também nesse estilo
no site. Refaça, seja mais moderno e bonito visualmente, sem poluir."*

### O loop do vídeo: a fusão era o defeito

⚠️ **Os coqueiros sumiam por causa da FUSÃO de 0,6s** que eu tinha usado
para fechar o loop (17/out · 13): no fim do clipe a cena do fim e a do
começo se misturavam, e o que só existia numa delas desbotava. Medido
quadro a quadro (SSIM por blocos, 320px): o quadro 120 do Kling casa com o
1 — o Kling recebeu o mesmo quadro como início e fim e cumpriu. **O laço
certo é corte seco: quadros 1 a 120, sem fusão** — a emenda mede 0,891
contra 0,894–0,908 dos passos vizinhos, um passo normal. O quadro 0 saiu
porque é quase idêntico ao 1 (0,999) e seria um engasgo. Sem crédito novo.
`login-video.json` tem `seg:5`; o pôster é o primeiro quadro do laço novo.

⚠️ **O diagnóstico anterior estava certo no número e errado na conta:** a
comparação era quadro 120 × quadro 0 numa cena que começa quase parada; o
par certo para medir uma emenda é (último, primeiro DO LAÇO) contra os
passos da própria vizinhança — não contra a média do clipe.

### O cabeçalho de cinema (`.pghero.cine`, `HERO_FOTO`)

Da prancha: todo cabeçalho de tela vira um **cartão escuro de cinema** — a
cena à direita sob um véu que escurece até o texto, o título grande, a
linha curta. **Escuro nos dois temas** (é cartaz, como o disco do Menu): o
cartão redefine `--cal`/`--cal-fraco`/`--cal-tenue` e o botão (`--btn-*`)
DENTRO de si, e tem cor de fundo sólida para a auditoria de contraste.

| a cena | telas |
|---|---|
| **fotografia de ofício** (as capas do `fotos.json`, sem rosto nem marca) | Feed (câmera), Vagas (luz), Brechó (foto), Jobs (som), Praças (drone), Porta-malas (edição) |
| **objeto 3D** (o `PG_OBJ` de sempre), grande, flutuando | o resto |

- **A pastilha `.pg-ico` continua dona da cor da área**: com objeto ela é o
  brilho por trás dele; com foto a cor vai no véu por cima (`::after`).
  `identidade` lê os dois lugares.
- **A ação do topo** (Novo job, Publicar vaga) desce para baixo da linha
  curta: à direita ela caía em cima da cena.
- **Celular**: foto em cima com o texto embaixo; objeto no canto, e o texto
  INTEIRO abre a coluna dele (só o título não bastava — a linha curta do
  Cofre passava por baixo do cofre).
- **A busca do Feed** sobe para dentro da borda do cartão (`com-busca`, que
  é marcado por JS — ver o `:has` abaixo).
- Os tipos de Vagas viraram **chips**; o ativo em ciano TINTO, não sólido:
  sólido brigaria com o "Publicar vaga" do mesmo cabeçalho.

**Foto nova para cabeçalho é crédito do Higgsfield** — não entra sem o
Victor ver o custo. As seis capas já existiam.

### O azul e o rosa nos detalhes (`--grad-marca`)

O degradê da marca (ciano → azul → violeta → rosa), que só existia no anel
do Menu e na tela de entrar: o fio em volta do cartão de cinema e os
brilhos dele, o fio de baixo da barra de cima (e da barra da home quando
condensa), a barrinha da pastilha da lateral, o brilho da pastilha da barra
de baixo, a manchete da home (o "livre na sua data."), o fio do plano
recomendado, a linha do alto de cada bloco do bento (acende ao entrar) e o
fio dos kpis. ⚠️ **É ENFEITE, NUNCA AÇÃO**: botão continua ciano sólido,
dado continua neutro.

### Sem rotulinho em cima do título (`lab-cima`)

Saíram o olho da home ("Agenda e contratação · audiovisual"), o "Como
funciona" e o "Moeda própria" da home, e o rótulo de toda tela — inclusive
o rótulo único de 23/ago ("Sua caixa", "Sua semana"), que respondia "onde
estou". **Quem responde agora é o título**, e `identidade` jura que nenhum
se repete. O separador dos planos ("Quem é freela") virou subtítulo de
frase, não caixa alta.

- **Regra de FORMA, não de lista**: `marcarRotulosDeCima()` marca, uma vez
  no arranque, todo `.lab` cujo irmão seguinte é h1/h2/h3. Tela nova
  herda sem código.
- O que carregava informação **mudou de lugar antes de sumir**: a praça da
  busca foi para o título ("Quem tá na escuta em Natal/RN"), e o
  "simulação" do preview do Porta-malas desceu para a nota, à vista.
- `jb-rot`, `mp-rot` e `oc-lab` continuam no DOM (o JS ainda os escreve ao
  trocar de chapéu); só não aparecem.

⚠️ **A BARRA DA HOME TREMIA, e eu culpei o seletor errado primeiro.**
Depois desta leva `home-clara` passou a estourar 2 em 3 com *"element is
not stable"*, em pontos diferentes. Suspeitei do `.lab:has(+ h1)` e troquei
por marcação em JS (que ficou — é mais barato e não custa nada), mas a
bateria seguinte reprovou igual. **A causa era a barra que condensa**:
passar de 18px de rolagem tirava 10px da altura dela, a âncora de rolagem
do navegador compensava puxando a página, a rolagem voltava para baixo
dos 18, a barra crescia — e o vaivém não parava. Já existia; ficou visível
porque, sem o olho, o topo encurtou ~48px e o Playwright passou a rolar
justo para essa faixa. **Conserto: folga** — condensa acima de 28, volta
abaixo de 4 (a faixa é o dobro do que a âncora mexe). 4 de 4 verdes, em 22s
em vez de 58s. Regra geral: **elemento sticky que muda de altura com a
rolagem precisa de dois limiares, nunca um.**

### As listas de gente (`.sg-lista`, `.time-lista`, `.ach-l`)

Quem eu sigo, Meu time (e o time da guilda) e Achar alguém na mesma
linguagem: **uma caixa** com as linhas por dentro e o fio começando depois
do rosto; **rosto redondo** com o anel azul; **nome inteiro** em cima,
função · cidade embaixo; mensagem num **círculo**, chamar na pílula.

- O "Quem eu sigo" perdeu os cabeçalhos por função (sete rotulinhos para
  sete pessoas): a função foi para a linha. Continua uma linha por pessoa.
- ⚠️ **Defeito antigo achado aqui:** o `.av` da lista não tinha tamanho —
  a coluna do rosto ficava vazia — e "Mensagem" + "Chamar" em texto comiam
  a linha, cortando o nome em "Natáli…". `.nm` é `display:flex` global
  (é da linha da busca): nas listas novas ele é `block`, senão nome e
  cidade saem lado a lado.
- Meu time continua agrupado por função (lá se preenche VAGA), mas os
  grupos moram numa caixa só; no celular o selo desce para baixo do nome
  e a ação vira o círculo do "+".
- Achar alguém trocou as iniciais pelo rosto e "ver perfil" por uma seta.

## 17/out · 13 — o escuro por padrão, o Menu da Lorien e a tela de entrar

Victor, com a barra e a tela de login da **Lorien World**: *"O símbolo do
menu pode ser um carrinho ou o símbolo do carro do freela, ele pode ter um
movimento também … o botão em si precisa ser clicável, não o nome Menu
embaixo. O tema principal da plataforma tem que ser o dark, esse é o
padrão. O light é opção. Coloca um menu de login mais bonito, mais animado.
Deixa só pra entrar com Google e com a conta oficial da carro do freela.
Brinca com a ideia do carro, UX/UI Design precisa ser de high end."*

### O escuro é o padrão de novo

Desde 17/out · 3 (a proposta C) abria no claro. Agora: sem nada guardado
abre no **escuro**; `cf-app-tema=light` é a única coisa que acende o
claro — no script de dentro do véu e no `aplicarTema`. Quem tinha escolhido
o escuro já guardou `"dark"`, então ninguém que escolheu perde a escolha.
`home-clara` (1c) trocou a asserção, com o porquê no comentário, e passou
a exigir também que o claro continue opção com o botão de tinta da C.
Home, bento, praça, planos e as oito telas principais foram conferidas no
escuro em 390 e 1440 — o escuro já tinha tokens próprios para tudo.

### O botão Menu da Lorien, com o carro (`#bt-menu .mnb`)

| peça | como |
|---|---|
| o disco | escuro nos DOIS temas (é um selo, como na referência), com brilho ciano por dentro |
| o anel | degradê da marca — ciano → azul → violeta → magenta — girando em 9s |
| o símbolo | as três barras da marca; acendem uma a uma, na ordem do rastro da abertura, 1s a cada 4,2s, e voltam a .34/.64/1 |
| o carrinho | dá uma volta rápida no anel a cada 9s e estaciona no alto à direita, onde a Lorien tem a estrelinha; com a gaveta aberta ele dá uma volta |
| a lombada | `#bt-menu::before`, da cor da barra com o fio dela, recortada (`clip-path`) acima da linha da barra — o botão SAI da barra |
| o rótulo | MENU em caixa alta espaçada |

⚠️ **O BOTÃO CRESCE PARA CIMA; o círculo não vaza mais.** Em 17/out · 10
o círculo subia por `top` negativo e ficava FORA da caixa do botão — e
toque em área que vaza da caixa é o que o iPhone mais erra (o "o botão em
si precisa ser clicável" dele). Agora `#bt-menu` tem `align-self:stretch`
com `margin-top:calc(-1 * var(--sobe))`: o stretch mede pela área da
fileira e a margem negativa soma, então a CAIXA do botão estica para fora
da fileira sem a fileira crescer (a barra continua com 65px). O círculo é
`justify-content:flex-end` dentro dela, e a altura dele acima da barra sai
do `gap` e do tamanho do círculo — não do `--sobe`, que só abre a caixa.
`menu-recolhivel` mede o círculo dentro da caixa, o toque no alto e na
beirada dele, a altura da barra, e o movimento reduzido parando tudo.

⚠️ **Giro é `transform` sem escala** — o anel e a órbita giram, nada
amplia, então o vetor não serrilha como a abertura de 17/out · 12.

**Segunda rodada, o círculo diminuiu** (Victor: *"a bolinha do menu pode
ser um pouco menor, achei muito grande o círculo. Mas tá ótimo, essas cores
rosa e azul é legal de explorar na plataforma"*): 58 → **50px** (48 até
380px), lombada de 62px. Para continuar saltando da barra ele sobe 4px por
`top` — DENTRO da caixa do botão, que começa acima dele. ⚠️ O círculo virou
`<i>`, não `<span>`: `guildas` conta todo `span` da barra como rótulo e
reprovava o círculo como "rótulo quebrando em duas linhas" — e ele não é
rótulo mesmo. **O rosa e o azul do anel ficam anotados como direção** para
explorar no resto da plataforma, quando houver lugar certo para eles.

### A tela de entrar (`.lgn-*`, `test/entrar.js`)

**Duas portas e só duas:** a conta oficial (e-mail e senha) e o Google.
Apple, WhatsApp e Microsoft saíram — e as 13 suítes que entravam por
Microsoft ou WhatsApp passaram a entrar pelo Google (era só a passagem; a
asserção de cada uma não mudou). `carteira` deixou de ler os selos por
provedor, que saíram junto.

| peça | como |
|---|---|
| a cena | NOITE nos dois temas: céu com o neon da casa, bokeh de luz (é audiovisual), a ponte Newton Navarro ao fundo (é Natal sem dizer), postes e coqueiros passando, a estrada com a faixa correndo e vento — e o **carro 3D da home** no meio, chegando com freada e balançando no motor |
| o topo | "Início" em pílula de vidro, a marca no centro, o tema à direita |
| o cartão | vidro sobre a cena, com o fio da marca girando em volta (`@property --lgn-ang`); treme quando falta algo |
| a chave | Sou freela · Quero contratar (as palavras dos botões da home) |
| a conta | e-mail e senha com rótulo flutuante, olho para mostrar a senha, "Esqueci a senha", Entrar com um brilho que passa |
| embaixo | ou · Continuar com Google · Ainda não tem conta? **Criar conta** · a linha "Nesta prévia, e-mail e senha não ficam guardados" |
| desktop | a cena ocupa a janela, o cartão flutua à direita, e o céu carrega *"Olha o carro do freela passando."* — a frase do grupo de onde o nome saiu |

⚠️ **A SENHA NÃO É GUARDADA EM LUGAR NENHUM, nem o e-mail.** Os dois
campos esvaziam no instante do Entrar, e a suíte varre o `localStorage` e
o `sessionStorage` atrás dos dois. Validação diz o que faltou (o @, os 6
caracteres) e marca o campo. **"Esqueci a senha" diz a verdade da prévia**
— não há senha guardada para recuperar — em vez de fingir que mandou
e-mail. ⚠️ "Lembrar de mim" da referência NÃO entrou: chave que não faz
nada é mentira de interface.

⚠️ **CRIAR CONTA É UM MODO DO MESMO CARTÃO** (`LG_MODO`), e leva ao perfil
sempre — mesmo num aparelho que já passou pela porta. `#hn-criar` (home)
abre já nele; `#lg-cad` alterna. Por isso `cadastro` deixou de pular para
o cadastro direto: ele cria a conta (e-mail e senha) como quem chega, com
o porquê no comentário. `show("entrar")` repinta o cartão (título "Sobe no
carro." para quem nunca entrou, "De volta à estrada." para quem já).

⚠️ **A PARTIDA NÃO SEGURA A ENTRADA.** O carro arrancando é uma CÓPIA da
tela (`.lgn-saida`, sem id, `inert`, `pointer-events:none`) que fica por
cima 0,85s enquanto a entrada de verdade já aconteceu por baixo. Atrasar o
login para a animação quebraria toda suíte que clica logo depois de entrar
— e faria a pessoa esperar por enfeite. Com movimento reduzido não há
cópia, e a cena inteira fica parada.

⚠️ **Cabe sem rolagem** (a regra de 19/ago), medido em 390×844, 390×664,
360×640, 1280×720 e 1440×900: a cena encolhe com a ALTURA (`svh`) antes de
qualquer botão; abaixo de 760px de altura saem a marca do topo, a frase e
a linha da prévia, e os campos descem a 46px. No celular o selo do cartão
sai (a marca já está no alto da cena) e o botão de suporte não flutua por
cima da tela de entrar.

⚠️ **`.lg` já existia** (a legenda da agenda) — o prefixo é `lgn-`. Os ids
antigos que as suítes usam ficaram: `lg-back`, `lg-cad`, `lg-sub`,
`lg-nota`, `[data-lgtipo]` e `[data-login="Google"]`.

### O vídeo do carro (`LOGIN_VIDEO`, `src/assets/login-video.json`)

Victor liberou gerar um vídeo em loop no Higgsfield, **consultando o custo
antes**. Orçado e aprovado: **11,5 créditos** (de 27,9) — o quadro no GPT
Image 2.5 (2K, 2,75) e o movimento no **Kling 3.0 Pro** (5s, sem som, 8,75),
com o carro 3D da casa como referência. O quadro é a orla de Natal à noite:
a ponte Newton Navarro em rosa e azul, coqueiros, postes e o carro ciano.

⚠️ **(SUBSTITUÍDO em 17/out · 14: a fusão fazia os coqueiros sumirem; o laço hoje é corte seco nos quadros 1–120.)** **O LOOP FOI FECHADO NA EDIÇÃO, não na geração.** O Kling recebeu o
mesmo quadro como início e fim, e mesmo assim o último quadro volta
deslocado (coqueiros e postes noutro lugar: SSIM 0,85 contra 0,995 entre
quadros vizinhos — um pulo visível). Em vez de gastar mais crédito, os
últimos 0,6s viram fusão com o começo (`xfade`): o clipe fica com 4,5s e a
emenda mede como um passo normal (0,86 contra 0,90 entre vizinhos depois
da compressão).

| arquivo | o quê |
|---|---|
| `mp4` | H.264 High, 1600×904, CRF 28, `+faststart`, sem áudio — **1,24 MB** (1,66 MB em base64) |
| `poster` | o primeiro quadro do loop em WebP 1280px, 51 KB |

O build foi de 3,46 MB para **5,16 MB**. ⚠️ **O vídeo só nasce quando a
tela de entrar ABRE** (`ligarVideoLogin`, chamado do `pintarLogin`): vira
Blob uma vez (`blob:` toca no Safari; `data:` em `<video>` é onde ele mais
falha) e pausa ao sair da tela. A home não decodifica nada.

⚠️ **É H.264 DE PROPÓSITO, e o Chromium das suítes NÃO toca H.264.** Todo
iPhone e Chrome de verdade tocam; o Chromium open source não tem o codec. É
isso que prova a saída de emergência: o pôster é o FUNDO da cena por baixo
do vídeo, e se o vídeo não tocar (codec, iPhone em economia de bateria
recusando o `play()`) ele some e fica o mesmo quadro parado. Para ver o
encadeamento TOCANDO aqui, a prévia trocou o vídeo por uma cópia VP9 só no
navegador de teste — o arquivo do produto não muda. Com movimento reduzido
o vídeo nem nasce: fica o quadro.

- **A cena desenhada em código continua montada como reserva** e sai de
  vista com o vídeo (`.lgn-cena.com-video`).
- **Na partida**, a cópia da tela acelera o vídeo (2,4×) e a câmera avança
  com um borrão — o arranque, sem segurar a entrada.
- **Véu de leitura**: no celular uma sombra em cima (para o topo); no
  desktop um véu no CANTO da frase — a primeira versão cobria a metade
  esquerda e apagava o carro.
- **`entrar` (57)** calcula onde o carro DO VÍDEO cai na tela (a caixa dele
  no quadro passada pelo `object-fit:cover` e pelo `object-position`) e
  exige o carro inteiro dentro da cena, o cartão sem cobrir e a frase do
  desktop sem encostar, em cinco tamanhos.
- ⚠️ **O CDN do Higgsfield passou a responder daqui** (em 17/out · 3 o
  proxy bloqueava e as imagens vinham em pedaços pelo `sandbox_exec`):
  `curl` direto no `result_url` baixou o quadro e o vídeo.

⚠️ **O farol desenhava um retângulo.** Degradê radial com o centro na
borda da caixa não chega a zero nela; a elipse agora tem o tamanho da caixa
e acaba em 68%, então some em todas as bordas.

## 17/out · 12 — o símbolo da abertura serrilhado

**Enviado ao domínio em `62ecfbe` junto com a 17/out · 11**, com `--seco`
antes e bateria 81/81; falta o Victor confirmar "17/out · 12" no pé do menu.

Victor: *"A animação da logo inicial … tá em baixa o símbolo, quando
aproxima pra tela dá pra ver o serrilhado do símbolo que tá em baixa
qualidade."* A travessia (25/ago · 2) crescia a marca com
`transform:scale(34)` a partir de um SVG de 74px.

⚠️ **O SAFARI RASTERIZA A CAMADA NO TAMANHO DE PARTIDA e estica o bitmap.**
Animação de `transform` vai para o compositor, que pinta o SVG uma vez a
74px e amplia a imagem pronta: 34× é cada pixel virando um bloco de 34.
É o serrilhado que ele via chegando perto. **O Chromium não mostra** —
ele repinta no fim, e o quadro congelado do Playwright sai nítido nos dois
builds. Esse defeito não se prova aqui; se prova no iPhone.

O conserto: **a marca cresce em TAMANHO, não em escala** —
`width/height` de 74px para 2516px (o mesmo 34×). Com o tamanho mudando, o
navegador redesenha o vetor a cada quadro, na resolução da tela, e a borda
continua borda. O centro é `left:50%;top:calc(50% - 6px)` com
`translate(-50%,-50%)` fixo, para crescer a partir do meio, e o `#splash`
ganhou `overflow:hidden` para os 2516px não alargarem a página por baixo do
véu. Com movimento reduzido a marca fica nos 74px e só dissolve, como antes.

⚠️ **O custo é repintura por 0,85s** — e é pequeno: um caminho só, num
elemento absoluto dentro de um véu fixo com `overflow:hidden` (o navegador
só pinta o pedaço que aparece). `movimento` passa igual.

⚠️ **A guarda é sobre o MECANISMO, porque o defeito não aparece aqui.**
`abertura` (29 → 31) congela a travessia aos 330ms e exige largura de
layout acima de 148px com o `transform` sem ampliar nada (escala 1), e a
página ainda com 390px. Semeada contra o build anterior ela reprova
(74px, escala 3,3). A curva começa devagar — aos 330ms são ~260px —, por
isso o limiar é o dobro, não os 34×.

## 17/out · 11 — "quando abre tá com zoom na tela"

Victor, com dois prints do iPhone (430px): *"Quando abre tá com zoom na
tela, tenho que tirar toda vez."* **Não era o zoom de campo de 19/ago** —
era a PÁGINA mais larga que a tela. A barra de cima levava marca, selo
Prévia, T$, P$ e a chave de lado; com o pedágio de boas-vindas (P$ 200,
que TODA conta nova ganha) ela passava 23px dos 430 e 12px dos 360. Página
mais larga que a tela é o que o Safari abre ampliado.

⚠️ **As suítes não viam porque nenhuma tinha o chip do P$ aceso** — ele só
aparece depois do brinde, e as contas de teste entram com `cdf-entrou`.
Medido com `isMobile:true` e o pedágio forçado: `innerWidth` virou **453**
numa tela de 430. Sem `isMobile` a página só ganharia rolagem lateral e a
conta pareceria certa — a mesma armadilha da meta viewport.

| o quê | onde fica agora |
|---|---|
| T$ e P$ | **continuam na barra** — pedido do Victor (20/ago · 8) |
| selo Prévia | sai da barra até 560px; o topo da gaveta tem o dele |
| chave freela/contratante | sai da barra até 560px; vira o segmentado **Freela · Contratante** na gaveta (`#g-ladoseg`, `[data-glado]`), que chama o MESMO `#modo-tog` e fecha o menu |
| avatar (`.top .eu`) | some até 820px — a conta mora no topo da gaveta |
| rótulo da chave | some até 820px (só a chave; o lado vai no aria) |
| gutter da barra | 16px até 480px |

⚠️ **E a barra não alarga mais a página nem por acidente**: `.top{overflow-x:
clip}` até 820px. Saldo de cinco dígitos que um dia não caiba vira um
pedaço cortado DENTRO da barra, não um documento mais largo. `clip` e não
`hidden` porque `hidden` faz contêiner de rolagem; e só no celular, porque
no desktop o `.top` é ancestral da lateral fixa. ⚠️ **O clip esconde o
estouro, então a suíte mede CORTE além de largura** — foi assim que ela
achou a faixa de 481 a 560, onde o avatar e o rótulo ainda estouravam por
baixo do clip sem alargar nada.

## 17/out · 10 — o menu recolhível

Victor, com um print do "Todas as telas" no celular: *"Esse menu é muito
feio e não acho muito intuitivo, muita coisa, fica cansativo"* — e três
referências (a barra da **Lorien** com o MENU levantado no centro, a
gaveta da Lorien e a gaveta da **ZRO Interno**): *"pode ser um menu
recolhível, tanto no desktop quanto no mobile."* Bloco `/* O MENU
RECOLHÍVEL (17/out · 10) */`, antes do selo Prévia.

**Enviado ao domínio em `3c11a6b`** (as duas rodadas juntas), com `--seco`
antes; falta o Victor confirmar no rodapé do menu, que agora mora no pé da
gaveta.

| peça | como ficou |
|---|---|
| **a gaveta** | desliza da ESQUERDA (`#gaveta`, mesmo id): no celular `min(340px, 100vw − 52px)` com a página escurecida à vista do lado; no desktop o painel flutuante da ZRO (332px, cantos de 22) |
| **o topo dela** | a marca + o selo Prévia (`[data-previa]` mudou do rodapé para cá) + fechar |
| **a conta** | o chip da ZRO logo abaixo (`#g-perfil`): avatar, nome, lado e "Ver perfil" — é a PORTA do Meu perfil, que é o "meu perfil lá em cima" de 19/ago; trocar (`#g-trocar`) e sair (`#g-sair`) viraram ícones nele |
| **Planos lá em cima** | segunda rodada, com a referência de uma linha "Planos [Profissional]": *"bota a aba de planos assim, e o tipo de plano, lá em cima"*. Na gaveta é a linha entre dois fios logo abaixo da conta (`#g-plano`); no desktop é o PRIMEIRO item da lateral (`.tab[data-tab="planos"]`). A pílula à direita é `tipoPlano()`: o degrau mais alto da pessoa (`planoTopo()`), "Grátis" para o freela grátis e "Carona" para quem contrata; plano pago acende na cor da marca. Ícone novo: a coroa (`ICO_MP.coroa`), também no cabeçalho da tela de Planos |
| **a lista** | uma coluna, linha de 42px sem caixa, por INTENÇÃO: o dia (`#g-hoje`: Feed, Propostas, Agenda/Escuta, Jobs) · Encontrar (`#g-nav`: Vagas, Achar alguém, Montar equipe, Passar o carro, Praças — o que é de graça antes da vitrine paga) · Ferramentas (`#g-ferr`: Orçamento, Cofre, Porta-malas) · A praça (`#g-mercado`: Brechó, Guilda, Aprender). `#g-voce` e "Sua conta" saíram |
| **o ativo** | pílula `--az-t` com a barrinha `--az` — o MESMO azul da lateral; a palavra "AQUI" saiu |
| **recolhidos** | Brechó (Catálogo, Inventário, Alugar, Vendas), Ajuda (os textos, as quatro portas, falar com a gente) e Ajustes (movimento, recomeçar do zero). Abertos ou fechados, ficam como a pessoa deixou (`cdf-menu-abertos`); o Brechó abre sozinho quando a tela aberta é ele |
| **o pé** | tema e som À VISTA (`.mn-pill`) — botão que se aperta no meio de uma gravação —, e a linha da versão |
| **a lateral do desktop** | a alça na borda (`#lado-tog`) recolhe num trilho de ícones: `html.lado-min{--lado:72px}`, e tudo que já lia `--lado` acompanha (corpo, topo, menu, título, chip da fase). Guardado em `cdf-lado-min` |
| **a barra do celular** | o Menu no CENTRO, em círculo da cor da marca com a tinta por cima, subindo ~20px acima da barra com um anel da cor dela. Três itens de cada lado, os mesmos de antes |

⚠️ **"Dentro do fluxo" SAIU.** Eram quatro botões desabilitados (perfil
de alguém, anúncio, salão, painel do job) que existiam para mostrar o
tamanho do produto (18/ago). Na gaveta eram peso sem porta — exatamente o
"muita coisa" — e `mapa` agora reprova qualquer botão desabilitado nela.
A contagem "19 telas" e o título "Todas as telas" saíram pelo mesmo motivo:
é menu, não inventário. `MENU_FLUXO` não existe mais.

⚠️ **Os grupos "eu" e "plano" do `MENU` não viram linha da lista.** `meu`/`minhaprod` continuam
no `MENU` porque é dali que saem o glifo da tela (`AREA_ICO`) e o portão
de fase; quem os mostra é o chip da conta. O mesmo vale para `planos`:
quem o mostra é a linha de cima (`#g-plano`).

⚠️ **A alça mora FORA da `<nav>` da lateral.** A lateral tem vidro
(`backdrop-filter`, 17/out · 6), e vidro faz do elemento o bloco de
contenção de todo filho `position:fixed` — a alça saía cortada ao meio
pela borda. É a mesma armadilha do `.top` em 17/out · 4, do outro lado.
`menu-recolhivel` confere com `elementFromPoint` na metade de fora.

⚠️ **As duas metades da barra são caixas próprias (`.bt-lado`).** Com
`grid-auto-columns:1fr` numa fila só, a fase escondendo a Guilda (Fase 1)
empurraria o Menu para fora do centro. Cada metade se redistribui sozinha;
no desktop elas são `display:contents` e não existem. O `offsetLeft` dos
itens continua contando a partir da barra (as caixas não são
posicionadas), então a pastilha que escorrega não mudou uma linha.

⚠️ **Margem negativa não levanta item de grid.** O círculo ficava 9px
acima da barra com `margin-top:-27px` e continuava em 9px com `-38px`: a
linha do grid encolhe junto e o item alinhado embaixo sobe de volta. Quem
levanta é `position:relative;top:-12px`, que não mexe no layout.

⚠️ **Grupo recolhido mudou cinco suítes, e a correção é abrir o grupo** —
que é o que a pessoa faz: `take`, `contraste`, `menu-e-chat`,
`guia-portas` (Ajuda) e `primeira-visita` (Ajustes). `versoes` abre TODOS
antes de ler o mapa de cada fase: lendo só o que está aberto, a Fase 1
passaria a "não ter" Minhas vendas por estar recolhida — verde ou vermelho
por motivo nenhum. `contraste` passou a auditar a gaveta aberta nos dois
temas.

## 17/out · 9 — Vagas, busca do brechó, cartão do job e a home no celular

Victor, depois da 17/out · 8 no ar: *"Pode executar o que vc solicitou e
sugeriu, gosto muito da ideia. Sobre a Homepage, pode deixar como está
agora, tá lindo. Só algumas mudanças."* A home em colagem (a terceira
sugestão) **não** entrou: a home fica como está.

### Vagas e oportunidades (`v-vagas`, `test/vagas.js`)

Produções publicam a vaga; freelas veem e mostram interesse. Prefixo
`vgp-` / `VGP` — **`VAGAS` já existia** (as vagas da escala em Montar
equipe) e `semAcento` também (catálogo de equipamento): os dois quase
colidiram, e a redeclaração de `semAcento` derrubou o script inteiro na
primeira build.

⚠️ **A REGRA, escolhida por mim e dita ao Victor:** **publicar é do
Volante** (`podePublicarVaga()`: contratante com `temNivel(VOLANTE)`, o
degrau de Passar o carro); **ver e mostrar interesse é de graça** para
todo mundo. Sem isso a vaga pública seria o Passar o carro de graça — o
"feed como classificado que esvazia o Volante" que o PRD registra. No
Carona, "Publicar vaga" mostra a vitrine (`#vgp-tranca`, degrau + preço +
o que continua grátis), nunca o formulário. Se ele quiser outra regra, é
uma função.

- **A diária nunca é escrita à mão:** `vgpDiaria(func)` = o meio da
  `REFERENCIA` (faixa da praça), nas semeadas e na que o contratante
  publica — e o formulário diz o valor ANTES de publicar.
- **Semeadas são de produtoras fictícias** (Agência Barlavento, Selo
  Norte, Coletivo Rebojo, Rádio Dunas, Podcast Horizonte, Bar Alecrim) —
  nunca a Prefeitura, que é órgão real, nem a `PROD` da conta.
- **Interesse e salvos são declaração da pessoa** → `DEPOSITOS`
  (`VGP`, `VGP_INT`, `VGP_SALVAS`), no mesmo commit.
- **Os interessados na vaga publicada são simulados** — só quem tem a
  função e está livre na data — e cada aviso vem com `sim:true`
  ("simulação — para você ver como é em uso").
- Porta: lateral (grupo O trabalho) e o MENU; a barra de baixo do
  celular já está cheia. `FASE_DE.vagas=4` (entra com a comunidade) — é
  um número, se ele quiser antes.
- Ícone: o **megafone 3D**, que já tinha sido gerado e ficou fora da
  build em 17/out · 4 — entrou no `home3d.json` (21 objetos), sem
  crédito novo.
- ⚠️ **Tela nova entra em `views`**, além do markup: sem a chave em
  `const views={…}` o `show("vagas")` escondia tudo e não mostrava nada.

### Busca do brechó e cartão do job (`test/busca-e-cartao.js`)

- `#b-qtop` no catálogo: todo anúncio ATIVO, título + categoria +
  descrição, sem acento e sem caixa, cada palavra contando. O resultado é o
  `cardAnuncio` de sempre — **nenhuma foto nova**. Dentro de uma categoria
  a busca geral sai e vale o filtro dela (`#b-q`).
- A ficha do dia na agenda virou **cartão**: cliente (o mesmo `.linkc`),
  função, horário se houver, e o **selo** Confirmado / Segurando data.

### A home no celular — e o defeito que era antigo

⚠️ **O CARRO NUNCA CHEGAVA.** `.revelar #h-rec #hb-carro .bn-obj` (dois
ids) ganhava de `#h-rec .bn-t.vivo .bn-obj` (um id): o carro do "Passe o
carro" ficava parado na posição de PARTIDA da animação — 160px à esquerda
no desktop, 60px no celular, por cima do título. Era o que o Victor viu.
`#h-rec #hb-carro.vivo .bn-obj` tem o mesmo peso da partida e vem depois.
No celular o carro foi para o canto do título e as três pílulas viraram
lista na largura inteira (o "muito campo vazio" era o vão à direita delas).
`home-clara` agora mede que o carro não cobre título, frase nem pílula.

- **Planos: um lado por vez no celular** (`#hp-pl-lado`, "Sou freela /
  Quero contratar"); os seis seguem no documento e o desktop segue com os
  dois lados. A asserção antiga ("dois trilhos que rolam") foi trocada pela
  nova decisão, com o porquê no comentário.
- **A frase "Nasceu no grupo de WhatsApp de Natal" saiu** do rodapé, e o
  **papel em branco no fim** também: era a folga de 74px que o `body`
  reserva para a barra de abas, que a home não tem (`body.na-home`).

## 17/out · 8 — a prancha do Victor: "Essas ideias"

**No domínio desde 17/out (`3f69530`, levas 6 a 8 juntas), confirmado pelo
Victor no rodapé do menu.** Bateria 77/77 e `--seco` antes do envio.

Depois das três propostas geradas no Higgsfield (Monitor de set, Claquete
editorial, Fita gaffer — `scratchpad/propostas3`), Victor respondeu com a
PRÓPRIA prancha: home, agenda, busca e brechó, claro e escuro, mais uma
home em colagem e uma tela de "Vagas e oportunidades". Bloco `/* A
PRANCHA DO VICTOR (17/out · 8) */`.

| da prancha | aqui |
|---|---|
| papel claro e neutro, cartão branco com fio | `--grafite #F7F6F3`, `--card-borda`, sombra mais curta |
| azul de seleção | `--az/--az-t/--az-tx`: item ativo da lateral e dia escolhido. O ciano segue marca e ação |
| lateral limpa | rótulo de grupo vira só o respiro; o relance do dia (`#lado-pe`) sai de vista; o menu vai para o canto de cima do conteúdo |
| cabeçalho com ação | `.pghero.tem-acao` — na agenda, **"+ Novo job"** (`#ag-novo`) abre o MESMO `abrirConvite()` do "job que veio de fora" de Jobs |
| Calendário · Lista · Financeiro | `#ag-vistas` + `#v-agenda[data-vista]`: as vistas **filtram a página**, não criam outra — "Calendário" é a página inteira de sempre, e é com ela que as suítes conversam |
| segmentado de tinta | `--seg-on:var(--cal)`, texto `--seg-on-tx` (volta ao desenho de antes de 17/out · 6) |
| datas em pastilhas | `.day` com fio e cantos; o escolhido em `--az` com letra branca |
| lista em cartão | `.rows` com fundo, fio e cantos |
| busca no topo da home | `#hp-busca` (só ≥821px): praça (cidades de `statsCidade`), função (as MESMAS seis dos chips da prévia), data (os sete dias da prévia) → a seta aplica o filtro em `#h-jogo` e rola até lá. `hjCidade` entrou no `hjMostravel`; "Natal e região" é a base inteira, a mesma conta do "N livres hoje" |

**O que a prancha trazia e NÃO entrou**, cada um pela regra que quebra:
estrela e nota ("4,9 (42)" — reputação são fatos); números de vitrine
("+8 mil profissionais", "+1.200 produções", "+95% de avaliações"); o
chip "Som direto" (função que não existe na base); "Freelas em todo o
Brasil" (a praça é Natal); miniaturas de portfólio na linha da busca e
foto por anúncio no brechó (trabalho e foto inventados para perfis
fictícios — a capa de categoria só vale para categoria). A home de foto
de fundo (coluna escura) também não: foto de set no topo foi recusada
em 17/out.

**Aberto, para decidir com o Victor:** a tela **"Vagas e oportunidades"**
(publicar vaga, lista de produções em busca de gente). É produto novo, e
mexe direto no Passar o carro, que é o que o Volante vende — uma vaga
pública que qualquer freela vê é o "feed como classificado que esvazia o
Volante" que o PRD já registra como risco. Não construir sem o sim dele
e sem a regra de quem vê.

⚠️ **A armadilha nº 7 apareceu de novo, e foi consertada na raiz.**
`.cols{padding:24px 0 60px}` zerava a folga lateral da `.wrap` da busca;
enquanto a lista não tinha fundo ninguém via, e o cartão novo encostou
na lateral e no vidro. Hoje é `padding-top`/`padding-bottom`.

⚠️ **Cartão com `overflow:hidden` muda o `sticky` de dentro.** O
cabeçalho de grupo da busca (`.secgrupo`, sticky em `top:154px`) passou
a grudar 154px DENTRO do cartão, por cima das linhas. O cartão ficou sem
recorte.

⚠️ **`innerText` de `<select>` conta as opções.** A busca do topo levou
a home a 708 palavras (teto 700) só pelas opções. Ficaram as seis
funções da prévia e datas curtas ("Hoje", "Amanhã", "seg 19") — que é
também o mais honesto: a busca não promete uma lista que a prévia não
mostra.

## 17/out · 7 — a ESTRUTURA SOBEDESCE: "mudou quase nada"

Victor, olhando a 17/out · 6: *"Mudou quase nada."* Tinha razão: aquela
leva trouxe o ACABAMENTO da referência (curvas, pílulas, segmentado) e
deixou a estrutura como estava. O que faz o SOBEDESCE parecer o Finder e
os Ajustes do Sistema é a estrutura. Bloco `/* A ESTRUTURA SOBEDESCE
(17/out · 7) */`, logo depois do da linguagem.

| peça | como ficou |
|---|---|
| **lateral = a janela inteira** | `top:0`, 236px; a marca e o selo Prévia moram nela (z-index acima do vidro); a navegação em **grupos** (`.ladog`: Hoje · O trabalho · A praça · Você), item de 34px, ativo em `--fill-2` |
| **a conta no pé** | o `#eu-bt` de sempre, `position:fixed` no rodapé da lateral: avatar, nome e o lado (`data-sub`, pintado por `::after`) — o chip de conta do SOBEDESCE |
| **cabeçalho de painel** | o `.pghero` deixou de ser cartão pastel de 200px: ícone (o objeto 3D numa **pastilha** `.pg-ico` com o pastel da área) + rótulo + título de 36px + linha curta, e um fio embaixo. A busca (`.bhead.pg-busca`) segue o mesmo desenho |
| **o título sobe para a barra** | `ligarTituloTopo()`: quando o título passa por baixo da barra, ele aparece pequeno nela (`#top-tit`, `body.tit-topo`) |
| **a tela se monta** | ao abrir, a pastilha entra com mola e os blocos da `.wrap` sobem em sequência (`cfmonta`, 40ms por bloco, teto em 0,2s) |
| **celular** | cabeçalho do iOS (ícone 62px à esquerda do título), barra de abas sem pílula (ativo em tinta, traço 2.3, fio de meio pixel), e a **alça** das folhas |

⚠️ **O TEXTO DO TÍTULO NA BARRA MORA NUM ATRIBUTO.** `#top-tit` tem o
título em `data-t` e o pinta por `::before`. Se fosse nó de texto, todo
`getByText("Propostas")` das suítes passaria a casar com dois elementos —
strict mode — e a varredura de contraste leria um texto que não é da tela.

⚠️ **A COR DA ÁREA MUDOU DE LUGAR DE NOVO**, do cartão para a pastilha do
ícone. `identidade` passou a ler `.pghero > .pg-ico` — a mesma exigência
(existe nas quatro áreas, pinta nos dois temas, quatro cores distintas),
no lugar onde a cor agora mora. O glifo da área continua no rótulo, mas
como traço de 15px, sem pastilha própria: duas pastilhas lado a lado
diriam a mesma coisa duas vezes.

⚠️ **Rótulo de grupo sem botão embaixo some** (`pintarGruposLado`, chamado
pelo `drawLadoPe`, que roda em todo `moverInd`). O lado da conta e a fase
escondem abas, e "A praça" sozinho seria cabeçalho de nada.

⚠️ **A pastilha que escorrega na barra de baixo FICA** — é o pedido de
25/ago ("uma leve transição do menu que está pra o outro clicado"). Ela
só perdeu a borda e virou o preenchimento do iOS.

**O que ainda não mudou, e é o próximo degrau se ele pedir:** o CONTEÚDO
das telas continua em cartões soltos; no SOBEDESCE ele mora em listas
agrupadas (caixa com fio, linhas de meio pixel), como os Ajustes. Isso é
tela por tela, não regra global.

## 17/out · 6 — a linguagem SOBEDESCE, com o sotaque do Carro

A leva 17/out · 5 foi ao domínio (`5eeb7f0`). Depois, Victor mandou o
código de referência de outra plataforma dele, o **SOBEDESCE** (zip +
README): *"use essa referência … como ideia de modelo visual e
comportamento de organização de abas e páginas. Motion e UX/UI Design.
Use como referência pra criar um exclusivo pra o Carro do Freela."*

⚠️ **A referência é DADO, não código da casa.** Ficou extraída numa pasta
própria do scratchpad, nada dela foi executado, e nenhum arquivo dela
entrou no repositório. O que veio foi a LINGUAGEM — curvas, formas,
comportamento —, reescrita aqui sobre os tokens que já existiam. O bloco
inteiro mora em `/* A LINGUAGEM SOBEDESCE … (17/out · 6) */`, antes do
selo Prévia.

### O que veio de lá

| peça | aqui |
|---|---|
| as duas curvas | `--ease-suave` (`.2,.8,.2,1`: sai rápido, pousa devagar) em quase tudo; `--mola` (`.32,.72,0,1`) no que SOBE — folhas, a pastilha da lateral |
| durações | 150ms campo/hover · 180–250ms botão e segmentado · 320–380ms folha · 0,9s revelar a home |
| botão | pílula sempre (`--r-btn:999px`), `active` encolhe a .98; o fantasma no claro vira **branco com fio fino** (`--gh-bg`, `--gh-sombra`) |
| segmentado da Apple | trilho cinza translúcido (`--seg-trilho`), ativo **BRANCO** com sombra de meio pixel (`--seg-on`, `--seg-sombra`) — vale para `.segm` e `.subaba` |
| modal e aviso | o "pop" de lá (6px + escala .98), raio 20, sombra grande (`--sombra-menu`) |
| tela | entra subindo 8px (`.entra`) |
| lateral de vidro | `--vidro-lado` + fio `--fino`, item de 36px, contador de tinta (não magenta) e **o relance do dia no pé** |
| celular | topo de vidro (`--vidro-topo`) e **todo modal vira folha que sobe de baixo** com mola, encostada na borda |

⚠️ **O segmentado MUDOU de regra.** Desde a leva da temperatura o ativo era
pílula sólida `--cal` (tinta). Branco sobre trilho cinza é o desenho da
Apple e é mais leve — o ativo continua dito por contraste e sombra, sem
depender de cor, que era o que a regra antiga protegia. `contraste` passou
nos dois temas.

### O que é do Carro e ficou

A cor da marca, os pastéis por área, os objetos 3D, a fonte da casa, o
claro como padrão e as cores de significado próprias (livre verde,
segurando âmbar, ocupado cinza). **O violeta/azul de envio e download do
SOBEDESCE não entrou**: ali cor significa sobe/desce; aqui significaria
nada. **A fonte SF Pro também não**: a casa não faz requisição externa e a
fonte dela já está embutida.

### O relance do dia (`drawLadoPe`, `#lado-pe`)

O medidor no rodapé da barra lateral de lá virou o relance do dia de cada
lado — chamado no começo de `moverInd()`, então toda troca de tela e de
chapéu repinta:

- **freela: "Sua semana"** — sete pontos pela `statusEu()` (a mesma da
  agenda), hoje com anel, e **"N esperando você"**, que é a
  `esperandoVoce()` de sempre e leva a Propostas. Com zero vira texto
  ("Nada esperando você"), sem botão — não há para onde levar.
- **contratante: "Hoje na praça"** — `livresEm(0)` na escuta de
  `CREW.length`, com barra. É o agregado SEM NOME que a casa já mostra na
  busca (`50 na escuta de 109`): prova densidade sem entregar a lista.

### ⚠️ A folha encosta no fim, e o botão de suporte caía em cima dela

Visto na foto, não em asserção: no celular o `#fbk-btn` (z-index 96, acima
de todo `.ovl`) cobria o texto do saque e o campo "Contagem de cliques" do
anúncio novo. Com o modal centrado isso passava; com a folha, não.
`body:has(.ovl:not([hidden])) #fbk-btn` some com ele enquanto houver folha
aberta (≤640px) — o mesmo tratamento do mapa e do visor de mídia.
`feedback` guarda as duas pontas: some com a folha, volta quando ela fecha.

⚠️ **E a armadilha de 17/out · 4 continua valendo**: o vidro do `.top` só
existe ≤820px. No desktop o `.top` é ancestral da lateral FIXA, e
`backdrop-filter` faria dele o bloco de contenção dela.

## 17/out · 5 — a prévia se declara num lugar só

Victor: *"Tira as mensagens de protótipo, tipo número de perfis de
demonstração, explicação sobre como funciona. Isso tudo é cara de
protótipo."* Saiu, e a restrição nº 6 do topo mudou junto:

- **Os banners de demonstração das telas** (busca, feed, guildas, salão,
  brechó, aluguel, cofre, sirene) e a nota do perfil — que começava com
  "Cadastro real", o que não é verdade desde 13/set.
- **O aviso de primeira visita deixou de abrir sozinho.** O `#ovl-pv`
  continua existindo (com os mesmos quatro fatos, reescritos como "sobre a
  prévia") e abre pelo **selo "Prévia"** (`[data-previa]`), ao lado da
  marca. É o "modo de teste" das plataformas grandes: dito uma vez, no
  lugar certo. No celular o selo do topo do app some (≤420px) e a porta é
  o rodapé do menu e o da página; na barra da home quem cede lugar é o
  seletor de tema (ele está no menu).
- **"Como funciona" saiu de todo cabeçalho** (`ligarExplicadores`): a
  linha curta (`data-lead`) fica como subtítulo; o parágrafo longo e as
  notas de regra da tela ficam recolhidos sem porta — explicação mora na
  Ajuda. O comparativo das moedas (sem `data-lead`) segue a regra antiga.
- **Home:** "perfis de demonstração" virou "em Natal e região"; saíram a
  nota do cartão e a frase do fechamento.
- Frases que FICAM, reescritas sem "protótipo": a assinatura gov.br
  ("Nesta prévia a assinatura é simulada"), o convite de lançamento ("Nada
  do que você fez dentro da prévia vai junto") e o porta-malas ("Pela API
  oficial do Google Drive, na sua conta — a plataforma não guarda o seu
  material").
- Os atalhos "Simular uma chamada/sirene chegando" ficaram (sem a frase
  que explicava o mecanismo): as suítes de tempo real e da sirene vivem
  deles, e são a única forma de ver o outro lado com uma conta só.

As 16 suítes que guardavam um banner passaram a guardar a regra nova — o
banner NÃO está na tela **e** o selo está —, com o porquê no comentário.

## 17/out · 4 — as telas de dentro na pegada da home

A leva 17/out · 3 foi ao domínio (`e0d8961`). Logo depois, Victor: *"Pode
mudar a estrutura visual das páginas internas, eu não gosto muito delas,
monte mais na pegada da homepage."*

### O cartão do topo (`montarHerois`, `.pghero`)

Toda tela do mapa abre como um bloco do bento: o **pastel da área**
(`--ar-pas`: trabalho → ciano, dinheiro → âmbar, equipamento → rosa,
turma → lilás — os mesmos pastéis da home), cantos de 30, o rótulo com o
glifo, o título pesado, a linha curta com o "Como funciona" e **um objeto
3D próprio** (`PG_OBJ`): propostas → envelope, agenda → agenda, jobs →
claquete, cofre → cofre, planos → moeda, feed → balões, porta-malas →
case, aprender → livro, guildas → bandeira, perfis → crachá, praças →
pino, achar → lupa, equipe → grupo, orçamento → calculadora, brechó →
câmera, passar o carro → o carro. A busca (`.bhead`, com a contagem à
direita) vira cartão por uma regra própria, com fones ("na escuta").

- **Feito em tempo de execução, MOVENDO os nós** — como o `montarGlifos`.
  Ids, handlers e o explicador ficam onde estavam; e como roda antes do
  `ligarExplicadores`, a linha curta e o "Como funciona" já nascem dentro
  do cartão. Reescrever 18 cabeçalhos à mão arriscaria o markup.
- **A identidade de área saiu do véu e foi para o cartão.** Onde há cartão
  a `.wrap` para de pintar (`:has(.pghero)`); onde não há (perfil, anúncio,
  salão, produtora, cabeçalhos próprios) o véu continua. `identidade` foi
  atualizada para ler o `.pghero` — e exige que ele EXISTA nas quatro
  áreas que mede.
- **A coluna do objeto é % do cartão** (`min(230px,28%)` no
  `grid-template-columns`, que resolve contra o contêiner): no Feed, que
  tem 680px, um objeto de 230 espremia a linha curta em duas linhas e o
  `explicador` reprovou — com razão.
- O rótulo dentro do cartão é `--cal-fraco`, não a cor da área: a cor de
  área sobre o pastel âmbar dá 3,7:1. Quem diz a área é o pastel e o glifo.

### ⚠️ `backdrop-filter` no `.top` SUMIU COM A BARRA LATERAL

Desfoquei o topo como a barra da home e a lateral passou a mostrar um item
só. **`backdrop-filter` (como `transform` e `filter`) faz do elemento o
bloco de contenção dos filhos `position:fixed`** — e a lateral é filha do
`.top`: o `top:61px;bottom:0` dela passou a medir contra os 60px do topo.
O topo é fundo sólido da cor do papel. **Antes de pôr filtro, transform ou
desfoque num ancestral, procure `position:fixed` dentro dele.**

### A navegação e os cartões

- Lateral sem painel: o papel continua por baixo dela, o ativo é uma
  pastilha branca com sombra (a `.tabind` de sempre — a `doca` mede a
  mesma coisa). Barra de baixo sem fio em cima, com sombra, e o ícone
  ativo numa pílula `--marca-t`.
- Cartões de dentro (`.jcard`, `.catcard`, `.zap`, `.kpis`, `.prop`,
  `.vitem`, `.card`): cantos da home e sombra macia no claro. ⚠️ **A
  diferença de tema mora em TOKEN** (`--sombra-cartao`, `--card-borda`,
  `--sel-*`, `--novo-*`), não em `:root.app-light .zap`: a guarda do
  `colisao` reprova o descendente quando a classe é a SEGUNDA de um
  elemento (`sl-card zap`). O selecionado e o "novo" ganham o contorno da
  marca em vez de fundo tingido.
- Objetos que existem e ainda não têm uso (megafone, sino, drone, ingresso,
  presente) ficaram FORA do `home3d.json` para não pesar a build
  (~3,3 MB hoje). Se um dia servirem a um estado vazio, regenerar.

## 17/out · 3 — a proposta C: claro, 3D, pastel, na plataforma inteira

Victor pediu três propostas visuais de home geradas no Higgsfield e
escolheu a C: *"Adorei a C, pra mim a plataforma inteira pode ser nesse
estilo. Bem lindo."* No meio da implementação mandou uma segunda
referência *"pra somar"* (faixa de recursos, linha do tempo, banda de
comunidade). A home virou a C com as peças da segunda que existem no
produto; o resto da plataforma ganhou a "pele" da C.

### ⚠️ O que as referências traziam e NÃO entrou — e por quê

As duas imagens eram mockups gerados, com texto inventado. Implementar o
visual não é implementar o texto:

| na referência | por que não |
|---|---|
| estrelas, "4,9 (42)" | a casa não tem estrela (reputação são fatos) |
| "+8 mil profissionais em todo o Brasil" | número inventado — virou **"N livres hoje"** derivado de `status()` |
| "Mais escolhido", "Mais popular" | prova social que ninguém deu — continua "Recomendado" |
| "Profissionais verificados" | verificado é conquistado, não é todo mundo — virou **"Verificado se conquista"** |
| planos "Básico/Profissional/Equipe R$ 29/79", "Sem mensalidade" | os planos são os da casa |
| "Som Direto", "Diretora de Arte" nos cartões | função que não existe na base |
| blog, vagas, eventos | não existem — a banda da praça lista **Feed, Guildas (Fase 4) e Coletivos** |

`home-clara` 1c reprova estrela, "+mil", "mais escolhido", "verificados" e
"sem mensalidade" no texto da home.

### O claro é o padrão — e a classe nasce DENTRO do véu

⚠️ **MUDOU EM 17/out · 13: o ESCURO voltou a ser o padrão** (ver a seção
daquele dia). O mecanismo descrito aqui continua o mesmo, só invertido: o
script dentro do véu põe `.app-light` quando a pessoa ESCOLHEU o claro.


`aplicarTema` agora começa em `light`; só quem guardou `cf-app-tema=dark`
fica no escuro. ⚠️ **A classe `.app-light` entra num `<script>` minúsculo
DENTRO do `#splash`, antes do conteúdo dele.** No script do fim do arquivo
ela chegaria tarde: a abertura pintaria escura e trocaria para clara no
quadro seguinte. Dentro do véu (e não antes dele) porque `abertura.js`
jura que o véu é markup antes de qualquer `<script>` — e continua sendo.

⚠️ **Suíte que mede "o escuro" precisa tirar a classe antes.** `identidade`
presumia o escuro como tema de abertura e passou a remover `.app-light`
explicitamente antes de medir — pré-condição dita, não asserção afrouxada.

### O botão de tinta mora em TOKEN

No claro o primário é **tinta** (`#1B1815`, letra branca), como na C; no
escuro continua o ciano de ação. ⚠️ **Por token (`--btn-bg`, `--btn-fg`,
`--btn-hover`, `--r-btn`), nunca por uma regra `:root.app-light .btn`**:
ela teria (0,3,0) e passaria por cima de TODO modificador de (0,2,0) —
`.gh`, `.mg` e os botões de componente — pintando tudo de tinta. Com token,
a especificidade da folha não muda e cada modificador segue vencendo.

**`--marca` ≠ `--ciano`.** `--marca` (`#17D1E8`, igual nos dois temas) é a
cor do carro e das três barras: marca da barra, dia escolhido, selo
"Recomendado", faixa do fechamento — sempre com `--sobre-marca` (tinta,
9,7:1) por cima. `--ciano` continua sendo o acento de AÇÃO e no claro
escurece para segurar contraste. Texto em `--marca` sobre papel dá 1,6:1 —
por isso o destaque da manchete é um gradiente próprio (`--hl-a/--hl-b`,
3,2 e 4,3:1 em tamanho de manchete), não a marca.

### Os objetos 3D — `src/assets/home3d.json` → `/*__HOME3D__*/{}` → `HOME3D`

Higgsfield `gpt_image_2_5`, `background:"transparent"`, 2k high, com a C
(job `28d2fd2b…`) e a marca como referência: **um herói** (o carro saindo
da agenda com as três barras de rastro) e **uma folha 3×2** (carro,
calculadora, agenda, escudo, câmera de cinema, aperto de mão). 5,5
créditos. Webp com alfa feito no Chromium (canvas), ~305 KB no total;
build ~3,0 MB.

⚠️ **A folha NÃO se fatia pela grade.** O carro passou da linha da célula e
a fatia fixa cortou o para-choque dele e pôs o pedaço dentro da
calculadora. O corte é pelo VÃO entre objetos: projeção do alfa por
coluna, em cada linha da folha, e as três maiores corridas são os objetos.

⚠️ **São ilustração, nunca foto.** `cara-de-empresa` continua jurando que o
hero não tem foto de fundo — agora exigindo que a ÚNICA imagem dele seja
um objeto de `HOME3D`. A banda da praça usa as **capas de ofício** (sem
rosto, sem marca) que já existiam.

### A home C, de cima para baixo

| bloco | o que é |
|---|---|
| topo | olho em caixa alta · manchete com o fim destacado (`FASE_HERO[n].d`) · sub · dois botões · **prova** (cinco rostos + "N livres hoje · perfis de demonstração", `drawProva`) · a arte 3D à direita |
| faixa | cinco recursos com ícone de linha (desktop); "Sinal e contrato" é Fase 2, "Acerto direto" é até a 1 |
| busca | o `#h-jogo` de sempre, agora LARGO e logo embaixo do topo; dias em pílula (o escolhido em `--marca`), quatro pessoas em cartão |
| bento | pastel por recurso, objeto 3D em cada um (a moeda continua o canvas) — **e o visual vivo derivado continua exigido** em todo bloco |
| como funciona | linha do tempo de quatro passos com ícone e número em `--marca` |
| a praça | banda escura com capa de ofício: Feed do set, Guildas (`data-fase="4"`), Coletivos |
| planos | os seis de sempre, cartões brancos, o recomendado com contorno `--marca` |
| fechamento | faixa ciano com o carro 3D + rodapé com a marca e os links |

**"Para quem é" (`#h-quem`) saiu**: a C não tem, a home já diz os dois
lados nos botões do topo, e eram ~50 palavras de lista.

⚠️ **"Criar conta" NÃO é `.entrar-cta`.** As suítes clicam em
`.homenav .entrar-cta` em modo estrito; dois elementos ali estouram. Ele
abre a mesma porta (o primeiro login cria a conta). E a classe nova vem
PRIMEIRO (`hn-criar btn sm`): a terceira guarda do `colisao` reprova
`.homenav .hn-criar` quando `hn-criar` não é a classe raiz.

⚠️ **Foto de página inteira mente sobre a home.** No `fullPage` do
Playwright as seções `.rvsec` saem em BRANCO (as transições de revelar não
fecham no `captureBeyondViewport`), embora estejam visíveis na tela. Para
revisar a página inteira, force o estado final antes da foto; para provar
que aparecem, foto por seção com `scrollIntoViewIfNeeded`.

### A pele C no produto (o "plataforma inteira")

Sem mexer em layout nem em decisão: claro como padrão; botão de tinta;
`--r-caixa` 12 → 16; `.card` com cantos de 20 e, no claro, **sombra macia
no lugar do contorno**; o **véu de cada área em pastel** (mesmo matiz da
cor de área, mais cheio, 420px); o glifo da área numa **pastilha branca**;
título de tela 38px no desktop. O escuro continua o de sempre.

## 04/out — cara de empresa grande: a revisão crítica e a leva que ela pediu

Victor: *"me mostra a plataforma como tá agora, quero que seja crítico o
suficiente pra dizer se a plataforma está com cara de amadora, quero que
ela seja uma plataforma com cara de empresa gigantesca."* A revisão (19
telas, 1440 e 390) concluiu: **produto de gente grande, embalagem de
protótipo**. Quatro famílias de defeito, e ele mandou fazer tudo
(*"pode fazer tudo, só me diz quanto precisa de crédito"*). Guardadas em
`test/cara-de-empresa.js`.

### 1. Texto que mentia — o pior achado, e nenhum era estética

- **"Os cadastros são reais"** em cinco lugares (home, busca, feed, dois
  rodapés). Desde 13/set a lista é FICTÍCIA. Virou "perfis de
  demonstração / fictícios" — e o número da home virou "perfis na
  demonstração" em vez de "profissionais cadastrados".
- **O Premium da home voltou a vender** "recibo automático", "quantas vezes
  apareceu em busca" e "clube de desconto" — exatamente os três que 19/ago
  tirou por não existirem. A lista da home agora é **igual a
  `PLANO_DET.premium`**, e a suíte compara as duas: lista copiada à mão
  descola na primeira mudança.
- **"Mais escolhido"** nos cards, antes do lançamento — prova social que
  ninguém deu. Virou **"Recomendado"** (é a nossa recomendação, e diz isso).
- **"Esperando você" dizia 4 na aba e 3 no número logo abaixo** — a aba
  somava ofertas do brechó, o painel e o menu não. Hoje é **uma função só,
  `esperandoVoce()`**, lida pelos três. Número que não bate entre si é o
  que mais faz desconfiar de uma tela.

### 2. Conteúdo primeiro — e a regra do explicador MUDOU

⚠️ **O explicador não abre mais inteiro na primeira visita.** Medido: no
iPhone, Propostas abria com uma tela inteira de parágrafo + painel de
números e **nenhuma proposta à vista**. Agora todo `p.lead.explica` tem
**`data-lead`** — uma linha curta — e o parágrafo inteiro mora atrás de
**"Como funciona"**, desde a primeira visita, para sempre. Sem `data-lead`
(o comparativo das moedas, `#ct-duas`) vale a regra antiga dos `VISTOS`.
**Tela nova com parágrafo de topo nasce com `data-lead`** — a suíte
`explicador` reprova parágrafo sem ele, e reprova linha curta que quebre em
duas a 1280px.

- **Propostas, Agenda e Jobs abrem no conteúdo**: a lista / o calendário
  vêm antes do painel de números, que virou o resumo embaixo.
- **Um número grita, o resto informa**: `.kpi.hot` deixou de pintar o
  número de magenta — a urgência virou um ponto antes do rótulo.
- **O aviso de demonstração virou faixa fina** (`.aviso`): continua em todas
  as telas que mostram dado simulado, mas deixou de ser um bloco amarelo.
- **O mês da agenda acalmou**: livre é a MAIORIA dos dias, e 30 caixas
  verdes cheias eram parede. Livre ficou quieto (número verde + ponto); o que
  tem coisa marcada é que ganha preenchimento.

### 3. Uma navegação só — a faixa virou barra lateral, a doca saiu do desktop

A revisão contou **três navegações ao mesmo tempo** no desktop: a faixa de
10 abas (cortando "Apr…"), a doca com 7 delas repetidas, e o menu. Agora:

| | desktop (≥821px) | celular |
|---|---|---|
| navegação | **barra lateral** (`.top .tabs`, fixa à esquerda) | barra de baixo (a mesma de sempre) |
| doca | **desligada** (`display:none`; o CSS dela ficou, comentado) | — |
| menu | botão no topo: o mapa de todas as telas | item "Menu" da barra |

⚠️ **São os MESMOS `.tab[data-tab]`**, só que em coluna — por isso nenhuma
das 65 linhas de teste que clicam neles mudou. O ícone de cada item é o
glifo de `AREA_ICO` (o mesmo do menu e do cabeçalho da tela).

⚠️ **O pedido de 25/ago continua valendo**: *"uma leve transição do menu
que está pra o outro clicado"* — a pastilha (`.tabind`) agora desliza na
VERTICAL, medida por `offsetTop/offsetHeight` (o `zoom` do corpo engana o
rect, a lição da doca). `moverInd()` chama `moverIndLado()` primeiro, então
todo lugar que já remedia a doca remede a lateral.

⚠️ **`body.com-lateral` abre o espaço** e é ligado em `show()` só quando o
topo existe (home e entrar não têm lateral). O topo leva
`margin-left:-var(--lado)` para a marca ficar EM CIMA da lateral, como em
Linear e Notion — sem isso ela andava junto com o conteúdo.

**A doca era pedido do Victor (25/ago).** Ela saiu do desktop porque ele
aprovou "uma navegação só" na revisão; voltar é tirar um `display:none`.

### 4. Acabamento

- **A marca não encolhe mais no celular** ("Carro d…" era a primeira coisa
  vista depois de entrar). Quem cede espaço: o rótulo do chapéu vira só a
  chave abaixo de 480px — e o lado vai no `aria-label`.
- **`.guconv b` é `display:block`** (é o título do bloco): o `<b>abaixo</b>`
  dentro da frase do convite da tabela quebrava sozinho numa linha. Negrito
  dentro de frase de `.guconv` é `<strong>`.
- **`.s-livre` vazava fundo e borda para `.disp`** — o "Livre" da busca saía
  numa caixa verde. `.disp` zera fundo, borda e padding.
- **"Quem te chamou: Você"** na escala da própria pessoa virou "Você mesmo
  — a escala é sua".
- ⚠️ **Erro meu na revisão:** eu disse que o aviso "Você ganhou P$ 200"
  ficava preso. Não fica — some em 9s; as fotos foram tiradas dentro desses
  9s. Registrado para não "consertar" o que não está quebrado.

### 5. Fotografia — a maior mudança visual

Plataforma de audiovisual **sem nenhuma imagem de gente** era a contradição
nº 1 (o brechó era a tela mais "empresa grande" justamente por ter foto).

**`src/assets/fotos.json` → marcador `/*__FOTOS__*/{}` → `const FOTOS`.**
Embutido em base64 como as fotos do brechó: nenhuma requisição externa. A
build passou de ~2,0 MB para ~2,7 MB.

| chave | o que é | onde |
|---|---|---|
| ~~`hero` + `recorte`~~ | ~~set noturno na praia de Natal~~ — **saíram em 17/out** (ver abaixo) | — |
| `rostos[id]` | um rosto por perfil fictício (103) | `c.foto` → todo avatar e o `#p-av` |
| `capas.{camera,som,drone,edicao,foto,luz}` | cena de ofício por função | capa do perfil de quem não publicou trabalho (`capaFuncao`) |

⚠️ **(HISTÓRICO — o hero de foto saiu em 17/out.)** **O HERO ERA EM TRÊS CAMADAS**: foto · palavra FREELA · pessoa recortada
POR CIMA — é o recorte que faz a palavra passar atrás do cinegrafista. A
palavra é **`::before`**, não texto: como nó de texto ela entraria na
auditoria de contraste contra o fundo do hero (não contra a foto) e
reprovaria sem defeito nenhum. O título entra **desfocado e ganha foco**
(`@keyframes foco`, o puxar de foco do cinegrafista), disparado pela
classe `abriu` que a saída da abertura põe no `body`. A cena desenhada do
carro **desceu para o fechamento da página** — fecha em vez de abrir.

⚠️ **ROSTO GERADO SÓ EM NOME FICTÍCIO**, chaveado pelo id do `crew.json`
SELADO. Ficam sem rosto de propósito: **a conta de demonstração** (é o
dono — ele sobe a própria foto) e **os 5 perfis incompletos** (perfil
incompleto sem foto é o que acontece de verdade, e vende o "Completar
cadastro"). No lançamento a base nasce vazia: nada disto vai.

⚠️ **O rosto acompanha o primeiro nome FICTÍCIO** (folhas separadas de
mulheres e homens), só para a demonstração não parecer quebrada. Isso
mora no script de montagem, **nunca no produto**: a regra de "não deduzir
gênero do nome" continua inteira para gente de verdade e para o filtro.
Um rosto de cocar cerimonial foi descartado — num perfil de operador de
câmera ele vira fantasia, não retrato.

**Como as imagens foram feitas** (para refazer): Higgsfield `gpt_image_2_5`,
2k, folhas de 20 rostos (5×4, sarjeta preta) — 3 de mulheres por faixa de
idade, 4 de homens; 1 folha 3×2 de capas; 2 heróis; remoção de fundo no
escolhido. Fatiadas no próprio Chromium (canvas → `image/webp`): rostos
144px q.74, capas 960px q.62, hero 1680px q.80. ~33 créditos ao todo. Os
scripts de fatiar ficaram no scratchpad da sessão — o método está aqui.

## 12/set — a declaração do dia: o modelo que o agente vai escrever

Construído depois do brechó, e antes do agente de propósito: **primeiro o
modelo, depois a boca que fala com ele.** Fazer o contrário seria construir
um agente que fala numa língua que o banco não entende.

### ⚠️ O DIA FECHADO NÃO SOBREVIVIA AO RECARREGAR

Achado ao abrir o `BLOQ` para substituí-lo, e é o defeito mais caro que esta
leva encontrou — mais que o do brechó.

`BLOQ` **nunca esteve em `DEPOSITOS`**. A pessoa fechava os dias na agenda,
recarregava a página, e **a agenda voltava inteira livre**. Ela passava a
aparecer como disponível em datas em que não está.

⚠️ **Num produto cuja métrica-mãe é "agenda viva" e cuja promessa é "saber
quem está livre", isso faz a BUSCA MENTIR** — e a busca é o que a assinatura
do Volante compra. O PRD escreve isso na seção 12 com todas as letras:
*"abaixo de 40%, a busca mente e o produto não vale a assinatura"*. O
produto tinha o mecanismo para chegar lá em zero.

**Como se provou que era ele, e não o ambiente:** um controle no mesmo
navegador e na mesma sessão — um job novo era gravado no `cdf-uso` e voltava
depois do reload; o dia fechado **não era nem gravado**. É a mesma técnica
da canária da `persistencia`: sem o controle, "não voltou" também poderia
ser o Chromium descartando armazenamento.

É irmão do defeito da tabela de diária, que este guia já registrava —
*"a pessoa preenchia as 19 funções, recarregava e voltava tudo para o valor
semeado"*. **Regra que sai daí: estado que a pessoa DECLARA nasce em
`DEPOSITOS` no mesmo commit em que nasce.** Não existe "depois eu ponho".

### A forma: três campos, e nenhum deles é "livre"

```js
const AGENDA={};   /* "AAAA-MM-DD" -> {e,p,h} */
```

| campo | valores | o que é |
|---|---|---|
| `e` | `fechado` · `negociando` | o que ela declarou |
| `p` | `dia` · `manha` · `tarde` | a que PARTE do dia aquilo se aplica |
| `h` | `"HH:MM"` ou ausente | a hora da virada, **se** ela disser |

⚠️ **LIVRE É A AUSÊNCIA DE DECLARAÇÃO, nunca um valor.** Com isso "liberar o
dia" é apagar a chave, e não existe estado órfão para limpar depois. Um
`{e:"livre"}` guardado seria uma segunda forma de dizer a mesma coisa — e
duas formas viram divergência na primeira vez que alguém esquecer uma delas.

⚠️ **`p` É INDEPENDENTE DE `e`, e a tela respeita isso:** trocar de estado
preserva a parte do dia, trocar de parte preserva o estado. Quem fechou a
manhã e depois diz *"na verdade estou negociando"* continua falando **da
manhã**. Zerar o outro eixo a cada toque faria a pessoa declarar duas vezes
o que ela já disse uma — e no meio do set ela simplesmente não declara.

⚠️ **MEIA DIÁRIA FECHADA CONTINUA SENDO UM DIA LIVRE.** É o ponto do pedido
do Victor — *"pode ser uma meia diária, e aí dá pra fazer os dois trabalhos
no mesmo dia"* —, e por isso `statusEu` só devolve "ocupado" quando
`p === "dia"`. Quem procura **precisa** achar essa pessoa naquela data; o
que muda é a janela no card, não o status. Só o dia inteiro tira da busca.

⚠️ **`h` FICA NULO QUANDO ELA NÃO DISSER, e isso é a regra da casa.** Quem
diz "de manhã" declarou *de manhã*, não "08:00–12:00". É a mesma linha que
já governava a janela do dia — *hora só de job registrado* —, agora no outro
lado: o produto mostra o que a pessoa disse, **no grão em que ela disse**.
A suíte tem asserção exigindo que a frase sem hora não contenha dígito
nenhum.

### As duas janelas, e por que são duas

- **`janelaLivre(c,off)`** — DERIVADA de job registrado com hora. Vale para
  qualquer pessoa, inclusive as 109.
- **`janelaEu(k)`** — o que a PESSOA DECLAROU. Só existe para quem declarou:
  no protótipo, a conta de demonstração.

⚠️ **Os 109 cadastros continuam com agenda SORTEADA, e sorteio não ganha
janela** — nem de meia diária, nem de hora. Quando a agenda for de verdade,
cada pessoa traz a declaração dela e a linha da busca passa a valer para
todas **sem mudar de forma**. Há asserção contando: numa busca de 34 linhas,
exatamente **uma** tem janela.

### ⚠️ O SCREENSHOT PEGOU DUAS COISAS QUE AS 35 ASSERÇÕES NÃO PEGARIAM

Vale registrar porque é a terceira vez que isso acontece neste projeto, e a
regra do guia continua valendo inteira: *asserção que passa não garante que
a tela está certa*.

1. **`min-width:92px` quebrava "Fechado" sozinho para a segunda linha** num
   iPhone SE — 3×92 + gaps passa dos ~280px úteis. Os três são irmãos e têm
   que ler como uma escolha só. Hoje é 68px, e há asserção contando
   **fileiras** (`getBoundingClientRect().top` distintos) em 375 e 390px.
2. **A nota se contradizia na própria linha.** Ela dizia *"Sem hora, a
   plataforma diz só ..."* e imprimia a janela ATUAL — que, com a hora
   preenchida, era justamente a **com** hora. Hoje são duas frases, uma por
   caso. A asserção que guarda isso exige que a frase do caso sem hora não
   tenha dígito.

### `test/agenda-declarada.js` — 35 asserções

Roda em **origem http**, pelo mesmo motivo da `persistencia`: o Chromium
descarta localStorage de `file://` de vez em quando, e o sintoma seria a
suíte falhando em lugar diferente a cada rodada.

### O que isto destrava, e o que ainda falta para o agente

Com o modelo de pé, o agente de WhatsApp passa a ter **onde escrever**, e as
quatro ferramentas dele são as quatro funções que já existem: `declarar`,
`liberarDia`, e a leitura por `decDe`/`janelaEu`. O que falta é tudo do lado
de fora — número, webhook, templates e o backend por baixo.

## O agente de WhatsApp — pedido do Victor (12/set), ainda não construído

Victor: *"um agente da Carro do Freela pra WhatsApp, onde o usuário
conseguiria atualizar a agenda — fechar a data, deixar livre, falar que está
negociando, e horários, se é diária inteira ou meia e quais horários ainda
tem livre. Essa é uma das maiores resoluções de problema pra o freela manter
a agenda atualizada."*

Ele está certo, e o produto já apontava para lá sem chamar de agente: a tela
da agenda promete *"no produto real isso chega por WhatsApp toda quinta —
você responde ali e nem abre o app"*, e o PRD fixa a métrica-mãe em 40% da
base com agenda de menos de 7 dias. **O agente é o mecanismo dessa métrica**,
não um item a mais na lista.

### ⚠️ MAS O MODELO DE AGENDA DE HOJE NÃO COMPORTA O QUE ELE CAPTURA

`statusEu(d)` tem três estados e todos são derivados: tem job → ocupado (ou
"segura" se `hold`); está em `BLOQ` → ocupado; senão livre. **`BLOQ` é um
conjunto de dias INTEIROS.**

| o que a pessoa diria no WhatsApp | tem onde guardar |
|---|---|
| "fecha o dia 12" | sim — `BLOQ` |
| "deixa o dia 12 livre" | sim |
| "tô **negociando** o dia 12" | só inventando um job com cliente e valor |
| "dia 12 só **meia diária**" | **não existe** |
| "dia 12 livre **até as 14h**" | **não existe na agenda própria** |

A janela do dia de 29/ago (*"livre até 14:00"*) só serve ao lado de quem
contrata, derivada de `ESCALAS` com `ini` e `fim` — e a regra escrita lá
continua valendo: **hora só de job registrado**, porque inventar hora para um
estado sorteado é mentir com precisão.

⚠️ **A ORDEM É: modelo primeiro, agente depois.** Fazer o agente antes é
construir uma boca que fala numa língua que o banco não entende. O modelo é
trabalho no `template.html`, pequeno perto do backend, e as suítes seguram.

### ⚠️ E ele mexe na restrição nº 1 — decisão do Victor, não minha

"Telefone nunca é versionado nem exibido" continua de pé: o agente não
versiona nem exibe. Mas **muda a postura** — hoje o telefone só existe no
aparelho de quem digitou; com o agente passa a existir num banco operado pela
plataforma. Exige finalidade na política de privacidade, **consentimento
separado por botão** (nunca caixa já marcada, como o convite de lançamento já
faz), saída por "PARAR", e o número nunca aparecendo para outro usuário.
**Quando isso for construído, vira a quinta restrição do topo deste arquivo**,
com data e motivo.

### A mesa de descarga (29/ago · 2 e · 3) — `test/descarga.js`

Victor trouxe uma dor que não é de contratação, é de OFÍCIO: *"o logger fica
responsável pelo backup. Durante edição realtime quem faz logger é o editor.
Às vezes ele se confunde: quais arquivos já fez backup, quais não. Porque
está recebendo de vários editores, e o cartão do MESMO editor é feito logger
várias vezes, sempre com takes novos. E ele precisa desses arquivos pra
editar realtime também."*

⚠️ **A UNIDADE NÃO É O CARTÃO, É A CHEGADA DELE.** O mesmo A001 volta cinco
vezes num evento. Tratar cartão como coisa única é o que faz a pessoa se
perder — cada chegada é um LOTE, com os arquivos daquela vez.

⚠️ **SÃO DUAS TRAVAS, e é entre elas que o esquecimento mora:** 2ª cópia e
na ilha. Faz o backup e esquece a ilha; ou manda para a ilha e fica sem
segunda cópia. Victor descreveu os dois lados na mesma frase.

⚠️ **A CRÍTICA DELE DERRUBOU A v1 INTEIRA, e com razão:** *"no realtime o
editor não tem tempo pra preencher essas coisas."* A v1 era um FORMULÁRIO
(de quem · rótulo · câmera · apontar · confirmar · duas travas) onde a
pessoa precisa de um GESTO. **Quando alguém está no meio do ofício, a
plataforma se pendura no gesto que ELA JÁ FAZ — não cria um.** Arrastar a
pasta virou a descarga inteira; o formulário virou "Digitar à mão", fundo de
gaveta para celular e cartão já copiado.

⚠️ **O ROLO SE ADIVINHA POR DOIS CAMINHOS QUE NÃO SE COBREM**: o nome do
ARQUIVO (`A001_C047.braw`, `A012_C001_0812XY.R3D`) e o nome da PASTA. Cartão
formatado monta como "NO NAME" no Mac — só o arquivo salva. Sony grava
`C0001.MP4` sem rolo — só a pasta salva. **Semeei um defeito na leitura do
arquivo e a suíte ficou verde porque a pasta cobria**; hoje cada caminho tem
asserção própria.

⚠️ **SEM CONFIRMAÇÃO, COM DESFAZER.** "Tem certeza?" é mais um toque no meio
do corte. O que protege sem custar tempo é poder voltar.

⚠️ **A CONFERÊNCIA DE DESTINO TIROU O PESO DAS TRAVAS MANUAIS**: arrasta-se
a pasta do HD (ou da ilha) uma vez e a plataforma confere TODOS os cartões
de uma vez. É a verdade do disco, não a memória de quem está cortando — uma
ação por hora em vez de duas por cartão. **Só chegada COMPLETA conta**: 7 de
12 não vira "copiado", porque meio backup não é backup.

### ⚠️ MESMO NOME NÃO É MESMO ARQUIVO — o defeito que só o DIA INTEIRO achou

O pior defeito que esta tela teve, e ele passou por 39 asserções verdes.

Rodando um dia simulado de ponta a ponta (7 arrastos, 3 operadores): uma
pessoa trouxe um cartão **formatado na mesma câmera do colega**, com os
mesmos `A001_C001.braw`. A tela adivinhou o mesmo rolo, casou nome por nome
e respondeu **"nada novo — todos já registrados"**, descartando o material
inteiro e dizendo que estava tudo certo. **Perda de material com carimbo de
segurança, causada pela tela que existe para impedir exatamente isso.**

⚠️ **O que separa os dois casos é o TAMANHO** (em bytes, não em MB
arredondado — é no empate que o conflito passaria). Nome igual + tamanho
igual = o mesmo arquivo de novo. Nome igual + tamanho DIFERENTE = outro
arquivo: entra como novo (**nada se descarta, nunca**), o eco grita, e um
toque em "É outro cartão" separa em `A001-2`. A conferência também exige
nome+tamanho: arquivo truncado tem nome certo e tamanho errado, e dar
"conferido" nele é o alívio falso mais caro possível.

⚠️ **A LIÇÃO DE MÉTODO, que vale para o projeto inteiro: asserção por
asserção não acha defeito de FLUXO.** Simular o dia de trabalho — sete
gestos em sequência, com os enganos reais no meio — acha o que nenhuma
unidade acha, porque o defeito morava na INTERAÇÃO entre adivinhar o rolo,
casar o cartão e triar os arquivos. Cada peça estava certa sozinha.

### ⚠️ BATERIA COM SONDA RODANDO JUNTO NÃO É BATERIA (29/ago)

Uma rodada acusou 2 falhas (`anuncio-no-feed` e `duas-moedas` estourando) —
e eu estava rodando as sondas do dia simulado EM PARALELO com ela. Rodada
limpa depois: 74 de 74. **Irmã da regra "bateria interrompida não é bateria
verde": sonda, screenshot e build ficam FORA da janela da bateria.**

⚠️ E a corrida do `anuncio-no-feed` era real, mas não era defeito do feed: a
asserção recalcula `Date.now()` milissegundos depois da pintura, e dois
itens de idade quase idêntica não têm ordem garantida. Ganhou folga de 5s —
**exigir ordem exata ali é exigir que o relógio não ande.**

### ⚠️ RESET Nº 21 — e o artifact provou a reconstrução linha a linha (29/ago)

Levou a leva da mesa inteira: código, suíte de 46 asserções, CLAUDE.md,
commit local. O `origin` estava em `29/ago · 1`; o **artifact publicado
minutos antes estava em `· 3`**.

⚠️ **A verificação evoluiu: em vez de contar linhas de diff, comparei o
MULTISET de linhas de código** (sem comentários, sem ordem) entre o
reconstruído e o publicado. Resultado: 287 linhas de diff bruto, mas só **35
linhas só no publicado e 13 só no reconstruído** — e a leitura dessas 48
achou **duas perdas reais** que o diff bruto teria escondido no meio da
reordenação: o campo *Câmera* do formulário manual e o tamanho no resumo.
Restauradas.

⚠️ **Diff bruto mede desordem; multiset de linhas de código mede
EQUIVALÊNCIA.** Reordenar CSS e mover comentário produz centenas de linhas
de diff e zero diferença de comportamento — e é justamente aí que uma perda
real se esconde.

### O lote do uso real (29/ago · 1) — `test/uso-real.js`

O Victor usou a plataforma num pedido de verdade (o teste do Teatro
Riachuelo) e voltou com sete pedidos de uma vez. Cada um virou coisa
construída, e a suíte `uso-real` (33 asserções) guarda o lote inteiro.

**1. O detalhe do job abre EMBAIXO do card tocado.** No celular a `.jgrid`
vira uma coluna e o `#jb-det` caía depois da lista INTEIRA. Agora
`posicionarDetJob()` move o `#jb-det` para logo depois do `.jcard.on`.
⚠️ É o MESMO elemento mudando de lugar, nunca uma cópia (ids duplicados =
lição do `fd-foto`) — e `drawJobs` o devolve à grade ANTES de repintar a
lista, senão o `innerHTML` o engoliria.

**2. O DONO edita o job — dono não é chapéu.** "Não consigo editar o job,
eu sendo o dono": todo portão olhava `MODO==="contratante"`, nenhum olhava
o job `deFora` que o próprio freela registrou. `mandoNoJob(e)` nasceu, o
botão vira "Editar job" (corrige os FATOS: nome, cliente, local, horas,
diária — a escala dele é ele mesmo), e `podeDocJob` + `abrirOrdemDia`
reconhecem o dono: no job de fora o freela É a produção do próprio dia.

**3. Material do job** (`blocoMateriais`, `e.mats`): link e arquivo — logo,
GCs, vinheta, PSD, música. Quem está no job põe; todo mundo do job abre;
tira quem pôs (ou quem manda). ⚠️ A honestidade dos documentos vale aqui:
imagem vira data URI e sobrevive; o resto fica de REGISTRO e a linha diz
"abre enquanto esta aba viver". Link é o caminho durável do arquivo grande.

**4. A OD aceita PDF — pela porta do ANEXO.** PDF achata a tabela numa
coluna, então ele NÃO passa pela leitura: vira o documento pronto do job
(`od.pdf`), com "Abrir PDF" no painel. E o "Substituir o cronograma"
agora guarda o anterior em `od.antes` com botão de desfazer — o relato
"subi a OD em word e bugou tudo" nunca mais é perda sem volta.
⚠️ A asserção antiga da `od-sai-e-volta` ("NÃO aceita .pdf") guardava a
decisão velha; foi atualizada para guardar a nova: duas portas, dois
destinos.

**5. Viaja a trabalho** (`viaja(c)`, `EU.viaja`): declarado no cadastro
(toggle sob a Praça), chip "✈ viaja a trabalho" no perfil, filtro "Topa
viajar" na escuta. Só existe o chip POSITIVO: ausência de resposta não é
"não". Nos cadastros de demonstração é simulado como o resto da agenda.

**6. A janela do dia** (`janelaLivre`): no card da escuta, quem tem job
REGISTRADO no dia mostra "job 13:00–21:00 · livre até 13:00" — a meia
diária que deixa dois trabalhos caberem no mesmo dia. ⚠️ HORA SÓ DE JOB
REGISTRADO: o status sorteado não tem hora dentro, e inventar "livre até
as 14h" seria mentir com precisão. Sem margem de deslocamento inventada:
o fato, e quem combina conhece o trajeto.

**7. Caderneta de voo do drone** (`voosDe`, `resumoVoo`, `docCaderneta`):
painel no Meu perfil (horas, jobs, locais — tudo DERIVADO dos jobs com
função de drone, nada digitado à mão: currículo qualquer um escreve; aqui
cada linha tem um contratante do outro lado) + documento por
`baixarFolha`/`imprimirFolha`. No perfil público, horas de voo viram chip.
⚠️ O documento DIZ o que não é: não substitui SISANT/ANAC nem DECEA/SARPAS
— apresenta-se JUNTO com os oficiais. Prometer "autorização de voo" seria
vender o que não é nosso. ⚠️ E bloco novo no Meu perfil exige caso novo em
`resumoBloco()`: a sanfona REESCREVE todo resumo por lá, e texto posto por
fora dura até a próxima passada — a `densidade` reprova com razão.

**O paradrop** (`cargaCai` + `zonaDrop`): não havia arrasto NENHUM — o
pedido criou o gesto, e a referência veio em vídeo (o "Paradrop": o
arquivo desce de paraquedas e a resposta forte é do POUSO). Traduzido sem
copiar o anel-que-vira-barra (coreografia de botão único; o Porta-malas
tem barra por arquivo): a carga leva o NOME REAL do arquivo (a animação
também é confirmação), a ação espera o pouso, rede de segurança de 1,1s
garante que animação nunca prende função, e reduced-motion pula tudo.
Ligado no Porta-malas (arquivo real entra na lista com nome e tamanho
reais; o DESTINO continua sendo escolhido antes de qualquer byte), no
Material do job e na janela de documentos. O dedo não arrasta arquivo: a
zona nunca substitui o botão.

**O que a bateria pegou que a suíte isolada não pegaria (três rodadas):**
(a) o resumo do bloco fechado da Caderneta saía vazio (caso em
`resumoBloco`, acima); (b) a `densidade` esperava 600ms fixos depois do
reload e a página, passando de 2 MB, estourava o prazo sob carga — espera
de relógio virou espera de condição (o padrão da `contraste`); (c) a
`anuncio-no-feed` ordenava num instante e conferia noutro, e a hora do
anúncio é "N dias atrás de AGORA" — repintar antes de medir fechou o vão.
Bateria que reprova diferente a cada rodada não se ignora: roda-se de novo
até sair limpa de ponta a ponta.

### ⚠️ RESET Nº 19 LEVOU UMA LEVA INTEIRA — e o artifact virou cofre (29/ago)

O pior dano até aqui: a leva `29/ago · 1` estava FECHADA — 73 de 73
verdes, commit local feito, artifact republicado — esperando só a
autorização de publicar. O reset veio nesse vão e levou TUDO: árvore,
commit, scripts de patch no scratchpad, os quadros do vídeo de referência.
O `origin` não tinha nada porque a leva nunca tinha ido para lá.

⚠️ **O `--seco` pegou DE NOVO** (segunda vez no mesmo dia): a autorização
já estava dada e o ensaio imprimiu `25/ago · 2` onde devia estar
`29/ago · 1`. Sem ele, regressão dupla publicada.

⚠️ **A reconstrução veio de DOIS cofres que sobrevivem a reset:** (1) a
CONVERSA — todo patch desta casa é um script com `sub()`+`assert`, e o
texto integral de cada um estava no histórico; reaplicar foi
determinístico; (2) o ARTIFACT — o build publicado em claude.ai guardava a
leva inteira compilada, e serviu de prova dos nove: o build reconstruído
diferiu do publicado em 31 linhas, todas comentário movido ou CSS
reordenado. **Byte-verificação contra o artifact é o teste de recuperação
mais forte que existe aqui.**

⚠️ **E a ordem mudou com justificativa:** com o build byte-idêntico a um
que passou 73/73 minutos antes, publicar ANTES da bateria de confirmação
passou a ser o risco menor — reset no meio de 25 minutos de bateria já
comeu uma leva; a bateria roda DEPOIS, como confirmação. Isso só vale
quando a equivalência com um build já testado foi VERIFICADA, não achada.

**Proposta pendente para o Victor:** um `git push` de branch de segurança
(sem deploy) a cada leva fechada tornaria o trabalho durável sem tocar o
domínio — mas branch em repositório com Vercel pode gerar preview de
deploy, então é decisão dele, não minha.

### ⚠️ RESET Nº 16 — o mesmo golpe, depois de publicado (25/ago · 6)

A árvore voltou para `a4ad115` / `25/ago · 2` de novo — a quarta vez nesta
sessão. Desta vez o dano foi menor só porque `a09cb39` (a doca, o brechó no
feed, o feed do dia 1) **já estava no `origin/main`**, publicado uma leva
antes. O que se perdeu foi só o que eu tinha escrito DEPOIS do último
`publicar`: a seção de evidência de campo no CLAUDE.md, inteira.

⚠️ **A recuperação parou de ser exceção e virou rotina, e o roteiro é
sempre o mesmo:** `git -C <mirror> fetch origin main` → `git archive
origin/main app | tar -x` num diretório à parte → diff arquivo a arquivo
contra a árvore local → copiar só o que o remoto tem mais novo. Nunca
sobrescrever a árvore inteira: o diff já provou, nas quatro vezes, que o
remoto é superconjunto do que sobra localmente — mas não custa conferir de
novo a cada vez, porque **um dia vai haver algo só local que o `git
archive` cego apagaria**.

⚠️ **A lição operacional, batida quatro vezes até grudar: nada que eu
escrevo depois do último `npm run publicar` está protegido — nem código,
nem CLAUDE.md, nem os `.py` de patch no scratchpad.** Isso empurra a favor
de levas menores e publicação mais frequente, mesmo com o custo de
interromper o Victor mais vezes para autorizar. Uma leva de duas horas
perdida dói menos que uma leva de um dia inteiro.

### ⚠️ RESET Nº 15 — e ele quase publicou uma REGRESSÃO (25/ago · 6)

O pior desfecho possível esteve a um comando de distância. A árvore voltou
para `25/ago · 2` — mais atrás do que o próprio `origin/main`, que já estava
em `· 4`. O commit local `2f22e28`, a doca, o feed do dia 1, o brechó no
feed, as duas suítes novas e **os scripts de patch no scratchpad**: tudo
sumiu junto.

⚠️ **QUEM PEGOU FOI O `--seco`, e é por isso que ele existe.** O Victor
tinha autorizado publicar. O ensaio imprimiu `25/ago · 2 · anônimo · 1941 KB`
onde eu esperava `· 6 · 1980 KB`. Rodar sem `--seco` teria empurrado para o
domínio uma versão **mais velha do que a que já estava no ar** — regressão
publicada, com autorização legítima nas mãos.

⚠️ **`npm run publicar -- --seco` ANTES de todo envio, sem exceção, mesmo
com autorização dada e a bateria verde de uma hora atrás.** A autorização é
sobre o CONTEÚDO; o ensaio confere que o conteúdo ainda é aquele.

⚠️ **O scratchpad não é cofre.** Os `.py` de patch que eu tinha guardado para
"reaplicar se der ruim" foram embora no mesmo reset. Reconstrução veio da
conversa, não do disco.

**E a regra de sempre, agora com número:** trabalho fora do `origin` está a
um reset de sumir — e o `origin` só se alcança por `npm run publicar`, que
tem dono. Enquanto ele não autoriza, a leva fica pendurada, e o jeito de
diminuir o dano é **fechar leva pequena e avisar cedo**, não acumular.

### ⚠️ O RESET Nº 12 LEVOU UM COMMIT — commit local não é lugar seguro (25/ago)

O pior de todos até aqui, e o mais silencioso. A árvore voltou para
`a4ad115` **com o `git` junto**: o commit `853f99f`, feito e conferido
minutos antes, **deixou de existir no histórico local**. Os marcadores de
sempre não acusaram — 71 suítes no lugar, `crew.local.json` intacto, build
com tamanho plausível.

⚠️ **O que denunciou foi um `assert` de patch falhando por count 0**: eu
tentei subir a VERSAO de `· 3` para `· 4` e o arquivo dizia `· 2`. Sem esse
`assert`, eu teria escrito por cima e publicado uma build sem o som e sem a
aceleração, achando que estava tudo lá. **O padrão do `sub()` com `assert`
não é zelo de estilo: é o detector de reset mais barato que existe**, porque
ele dispara no primeiro patch depois do estrago.

⚠️ **MARCADOR NOVO, e é o mais confiável de todos: `git log --oneline -1`
contra o último commit que você lembra de ter feito.** Ele pega o caso que
contagem de suíte e tamanho de build não pegam — a árvore volta *coerente*,
só que velha.

⚠️ **A LIÇÃO QUE MUDA A ROTINA: commit local NÃO sobrevive a reset. Só o
remoto sobrevive.** Foi o `origin/main` que salvou tudo desta vez — o
`app/` publicado tinha o som, a aceleração e a suíte de 29 asserções. A
recuperação virou:

```
1. git -C <clone> fetch origin main
2. git archive origin/main app | tar -x   → compara arquivo a arquivo
3. restaura só o que o remoto tem mais novo; MANTÉM o que a árvore tem
   mais novo (aqui, a contraste com duas esperas era superconjunto)
4. reaplica por script o que ainda não tinha subido
```

⚠️ **E o passo 3 é o que quase se erra**: sobrescrever a árvore inteira com
o remoto teria apagado o trabalho da hora seguinte ao último push. Diferença
arquivo a arquivo antes de copiar, sempre — nunca `tar` cego por cima.

**Consequência prática:** trabalho que ainda não foi para o `origin` está a
um reset de sumir. Quando uma leva fecha, o lugar de guardar é o remoto — e
como publicar é ação de fora e tem dono, o que se faz é **avisar o Victor de
que a leva está pronta e pendurada**, não empurrar por conta própria.

### ⚠️ `explicador` também recarregava em `file://` — mesma doença, 24/ago

Reprovou na bateria (5 falhas pós-`reload`) e passou 3 de 3 rodada à
parte: a assinatura EXATA do flake documentado abaixo. Migrada para o
`_servir.js`. Ao caçar por que uma suíte de reload falhou, conferir a
ORIGEM antes de conferir o código.

### ⚠️ `orcamento` reprovava sozinha em bateria completa — era `file://`

A suíte dá `reload()` para provar que a margem vira padrão da produtora, e
rodava em `file://`: o Chromium descarta o localStorage dessa origem ~1 em
14 recargas (a mesma causa que custou uma tarde em `persistencia.js`).
Sintoma clássico: reprova na bateria e passa **3 de 3** rodada à parte.
Passou para a origem http do `_servir.js`. **Suíte nova que recarrega nasce
em http.**

---

## 23/ago — reset nº 7, Mensagens fora do mapa, PRD v3.0 e um protótipo por fase

### O reset nº 7 pegou no meio de um patch

Aconteceu **entre dois comandos**: o `sub()` casou com âncoras que existem
tanto no template novo quanto no snapshot de 20/ago, então o patch aplicou
**no arquivo velho** e o build caiu de 1855 KB para 1678 KB. O tamanho foi o
que denunciou.

⚠️ **Marcador novo e mais barato que todos os outros: o TAMANHO DO BUILD.**
`npm run build` imprime os KB; queda súbita = a árvore não é a que você
pensa. Vale mais que contar suítes, porque sai de graça em toda build.
Recuperação pelo repositório, dois minutos, como nas anteriores.

### 1. "Mensagens" saiu do mapa de telas

Victor: *"tire do menu a aba mensagens, ela é a aba propostas."* Certo — o
botão fazia `show("propostas")` com o painel de enviadas. Dois nomes para
uma tela é o defeito do "Início que abria Praças" outra vez.

⚠️ **O que não podia sumir junto era o CONTADOR de conversa não lida.**
Ele mudou de casa: `itemMP` ganhou um parâmetro de badge e o `g-msg-bg`
passou a viver no próprio item de Propostas. `pintarBadgeMsg` não mudou uma
linha — ele procura o id, e o id continua existindo.

### 2. PRD v3.0 — a régua do corte mudou de novo

Victor: *"quero que na primeira fase a agenda dos freelas e o brechó só com
venda de equipamento seja implementado principalmente."*

**A régua da v3.0: fica dentro o que resolve a dor SEM depender de
terceiro.** As v1.0 e v2.0 punham o sinal em custódia no lançamento — e
custódia exige parceiro aprovado, CNPJ nascido conforme a exigência dele e
homologação. Era **a dependência mais lenta do plano inteiro no caminho
crítico do primeiro usuário**. Com a régua nova a Fase 1 sobe sem nada
disso, e a conversa com o parceiro corre em paralelo.

O argumento que faltava e que sustenta a escolha dele: **o brechó resolve o
problema que o feed ia resolver.** A v2.0 punha a rede no lançamento para
dar motivo de abrir o app num dia sem job, e carregava junto o risco que ela
mesma registrou — *feed vazio no lançamento*. O brechó dá o mesmo hábito com
conteúdo que já existe: ninguém precisa ser convencido a anunciar a lente
que quer vender.

**E o custo está escrito na cara**, seção 08: a Fase 1 **não tem receita de
transação**. Sem custódia não há 6%, sem pagamento no brechó não há 5%. A
única receita é o Volante — coerente com o que ela entrega, mas teto baixo.

Novas fases: 1 agenda+brechó · 2 dinheiro · 3 documentos · 4 rede ·
5 equipamento inteiro · 6 seguro e segunda praça. A coluna "MVP" da tabela
de requisitos virou **"Fase"**, com o número em cada linha.

### 3. Um protótipo por versão do roadmap

`node src/build.js --fase=N` → `public/fase-N.html` (+ `-artifact`).

⚠️ **COM `FASE=0` NADA DISSO ACONTECE, e é a decisão central.** Todo portão
é no-op no build padrão — que continua sendo o produto inteiro e é o que as
64 suítes testam. Um sistema de fases que mexesse no build normal criaria
uma segunda verdade para manter.

Peças: `FASE_DE` (tela → fase em que chega), `FASE_BP` (painéis do brechó),
`faseTem(n)`, `naFase(tela)`, `aplicarFase()` e o chip `#fasechip` (canto
de baixo à ESQUERDA — o suporte já mora na direita) que abre a lista das
seis fases com o que cada uma entrega.

Os portões que não são de navegação, e por que só estes três:
- **`comGarantia` devolve falso abaixo da Fase 2** — com isso a escala
  inteira fecha em acerto direto, que é exatamente o que a fase é. Um
  gate só, e o app todo se comporta como a fase.
- **`blocoContratos` devolve vazio** abaixo da 2.
- **Os chips de carteira e pedágio** têm `data-fase="2"` no markup.

⚠️ **O DEFEITO REAL DESTA LEVA: `aplicarModo()` REESCREVE O `hidden` DE
TODA ABA.** Esconder por fora dela durava até a primeira troca de chapéu —
a Fase 1 abria mostrando Feed e Guilda na barra. O gate teve que mudar de
lugar, para DENTRO do cálculo do `hidden`. Regra geral: **onde há uma
função que recomputa visibilidade, é lá que qualquer regra nova de
visibilidade tem que morar.**

⚠️ **A porta de entrada precisa existir na fase.** O login cai no feed, que
só existe da Fase 4 em diante; abaixo dela cai em Propostas. Tela padrão que
não existe na versão é tela branca.

### 4. O brechó inteiro subiu para a Fase 2 — e o seguro desceu

Victor, depois de ver as versões: *"a segunda fase em diante já pode mandar
a aba brechó completa. Não mexa na versão completa do protótipo — ela é a
última fase do roadmap faseado."*

Ele está certo pelo motivo de encanamento: **inventário e aluguel só ficam
de pé com pagamento**, que é justamente o que a Fase 2 traz. Separá-los em
duas fases seria construir a mesma canalização duas vezes. Então o brechó
completo (pagamento com taxa, inventário, kits, transferência de posse,
aluguel entre pares e contrato de locação) passou toda para a Fase 2.

**O que sobrou adiante foi o SEGURO**, e ele é outra conversa: depende de
corretora, não de pagamento. Dossiê e ocorrência viraram a Fase 5
(`faseTem(5)` guarda os dois botões no card do inventário), e a Fase 6
virou **a segunda praça** — a única fase que **não acrescenta tela**, e é
por isso que o protótipo dela é o produto completo, que era exatamente o
que o Victor disse.

| | antes | agora |
|---|---|---|
| Fase 2 | dinheiro | dinheiro **+ brechó completo** |
| Fase 5 | equipamento inteiro | **seguro** (dossiê e ocorrência) |
| Fase 6 | seguro e segunda praça | **a segunda praça** |

⚠️ **A instrução "não mexa na versão completa" já era garantida por
desenho** — `FASE=0` é no-op —, e agora tem asserção com nome: a suíte
`versoes` confere que o build padrão não tem chip, mantém a garantia ligada
e continua caindo no feed.

### 5. O inventário desceu para a Fase 1, e os planos passaram a ser faseados

Victor: *"melhor… coloca o inventário na fase 1 também, dentro do brechó e
uma opção dentro do meu perfil, pra preencher o inventário lá, em aba.
Depois reveja os planos nas versões, pra as versões fazerem sentido."*

**O inventário é DECLARAÇÃO — não cobra nada de ninguém.** E é ele que faz
o anúncio do brechó nascer com ficha pronta, então na Fase 1 ele é a peça
que barateia a outra metade da fase. `FASE_BP={inv:1,vender:2,alugar:2}` —
o aluguel fica na 2 porque cobra 5% do período.

**A aba no Meu perfil** (`#pf-inv`, `pintarInvPerfil`): resumo, as peças com
quem está sem ficha, e duas portas — *Adicionar equipamento* (abre o MESMO
modal do brechó) e *Abrir meu inventário*.

⚠️ **NÃO é uma segunda cópia da tela.** Duplicar significaria duplicar
`inv-lista`, `inv-fatos` e companhia — id repetido é a armadilha nº 1 deste
arquivo. O bloco LÊ `invItens()` e os botões abrem o mesmo modal.

⚠️ **"Meu equipamento" JÁ EXISTIA** no perfil — as câmeras e lentes que
aparecem na busca. Nomear o bloco novo igual deixou **dois cabeçalhos com o
mesmo nome na mesma página**, que é a definição de duas verdades. Virou
**"Meu inventário"**, logo depois do irmão, que é de onde o estoque inicial
dele sai.

⚠️ **`sanfonaPerfil()` REESCREVE O `<em>` DE TODA CABEÇA** com um resumo
genérico, e ela roda num `setTimeout(...,0)`. Quem pinta antes tem o texto
sobrescrito — o resumo do inventário saía como *"nada listado"* com doze
peças dentro. Quem pinta por último ganha: `pintarInvPerfil()` passou para
dentro do mesmo `setTimeout`, depois da sanfona.

**Os planos também são faseados** (`FASE_PLANO`, `planoNaFase`) — é a régua
da vitrine aplicada ao catálogo: **plano não vende o que a fase não faz.**

| plano | chega na | por quê |
|---|---|---|
| Carona · Volante · Freela | 1 | o Volante É "ver quem está livre", que é a fase |
| Premium · Frota | 2 | relatório do ano, taxa reduzida, cláusulas — tudo dinheiro |
| Estrada | 3 | orçamento |

Na Fase 1 o lado do freela **não vende nada**, e é decisão: a base precisa
encher antes de a agenda valer alguma coisa.

### 6. O feed desceu para a Fase 1 — e trouxe a denúncia junto

Victor, curto: *"bote o feed na fase 1."* Contra a minha recomendação, e ele
conhece a praça. O argumento a favor é o da própria v2.0 do PRD e continua
de pé: **num dia sem job é preciso ter motivo para abrir o aplicativo**, e o
feed é a alavanca da métrica-mãe.

O texto do PRD mudou de tese junto, e ficou mais honesto: em vez de *"o
brechó resolve o problema que o feed ia resolver"*, agora é **"os dois
respondem à mesma pergunta e por isso vão juntos"** — o brechó chega com
conteúdo que já existe e segura o tráfego enquanto o feed pega ritmo; o feed
é o que faz a pessoa voltar, porque tem gente do outro lado.

⚠️ **O RODANDO FICOU NA FASE 4, e por motivo próprio:** é o anúncio mais
visível e mais barato do calendário — gastá-lo no lançamento é desperdiçar
uma campanha pronta. `data-fase="4"` na tira, dentro do feed que já existe
na 1.

⚠️ **A CONSEQUÊNCIA QUE NÃO PODIA PASSAR: a DENÚNCIA virou Fase 1.** O
próprio PRD registrava o risco — *rede de nomes reais em praça pequena* —,
e ele estava resolvido por adiamento: a denúncia entrava "junto com a rede",
na 4. Com o feed no lançamento, feed sem botão de denúncia num mercado onde
todo mundo se conhece é o tipo de risco que se paga caro uma vez só. Ela é a
única peça social que o protótipo ainda não desenhou, e deixou de ser
adiável. Está escrito em caixa de alerta na seção 08 e na tabela de riscos.

⚠️ **A estrada dos planos (`#pn-via`) some enquanto a escada está
incompleta.** Ela tem cinco paradas fixas indexadas por `DEGRAU`; filtrar as
paradas quebraria `viaPor`/`viaMarcar`/`nivel` inteiros. Some, e a linha da
escada explica em palavras que os outros degraus chegam depois — o que é
mais honesto que mostrar destino que a versão não tem.

---

## 23/ago — a denúncia, a última peça social que faltava

Ela estava listada como risco desde a v2.0 do PRD e nunca tinha sido
desenhada: *rede de nomes reais em praça pequena*. Um post
**"fulano me deixou na mão"** é a regra da casa de não atribuir defeito a
pessoa real — só que escrita por um usuário, não pela plataforma. Com o feed
na Fase 1 ela deixou de ser adiável, e o Victor mandou construir.

### As três regras duras, todas escritas na tela e nos termos

1. **DENÚNCIA NÃO DERRUBA POST SOZINHA.** Nenhum número de denúncias remove
   nada automaticamente — quem lê e decide é uma pessoa. Sem isso vira
   **brigada de denúncia**: um grupo combina e derruba quem quiser. É a
   mesma concentração que a casa recusou vender por dinheiro (posição na
   busca), e não faz sentido entregar de graça por capital social.
2. **NINGUÉM SABE QUEM DENUNCIOU**, nem o autor. Numa praça onde todo mundo
   se conhece, denúncia com nome não é denúncia: é briga marcada.
3. **O QUE SOME AGORA É DA SUA VISTA.** É o que a plataforma consegue fazer
   sozinha, e é o alívio imediato que a pessoa quer — mas a tela **não
   promete que sumiu para os outros**, porque não sumiu.

### O que sai e o que NÃO sai

O artigo `AJUDA.regras` ("Regras do feed e denúncia") diz os dois lados, e o
segundo é o que evita o produto virar mural de elogio: **crítica de trabalho
sem apontar pessoa, discordância e reclamação de mercado FICAM.** O limite é
a **pessoa identificada**, não o tom. Há asserção com `⟶⟶` para isso.

### Peças

`MOTIVOS_DEN` (lista fechada, seis motivos, o primeiro é o caso que motivou
tudo), `DENUNCIAS`, `denunciei(tipo,id)`, `postVisivel` (derivado — o que EU
denunciei some da MINHA vista, nas duas abas), `abrirDenuncia`,
`enviarDenuncia`, modal `#ovl-den`, botão `⋯` no post (**nunca no próprio**)
e "Denunciar" no comentário — **é no comentário que o caso de risco mais
aparece**. O envio usa a MESMA porta do suporte (Web3Forms com fila local
honesta), e nunca finge que enviou.

### ⚠️ Três defeitos meus, e os três valem a regra

1. **`fbkFila.por(...)` não existe** — a fila tem `ler()` e `gravar()`. Eu
   escrevi de memória em vez de ler a API. A suíte pegou pelo erro de
   console.
2. **`.x` NÃO EXISTE NO CSS DESTA CASA.** Copiei um botão de fechar de
   modal de outro projeto: saiu como caixa branca do navegador, e o `✕`
   (U+2715) nem está na fonte. Os modais daqui fecham com botão de verdade
   (`.btn gh`). Valeu para o `#ovl-fase` também, criado no mesmo dia.
3. **ESTADO QUE ENTRA EM `DEPOSITOS` NASCE ANTES DE `DEPOSITOS`.**
   `let DENUNCIAS=[]` estava lá embaixo, junto com o resto do código da
   denúncia. `usoRestaurar()` restaurava o valor e a declaração zerava tudo
   logo depois; o erro de TDZ caía no `catch` do restaurador como
   `console.warn` e **passava despercebido**. Sintoma: a denúncia
   simplesmente não sobrevivia ao recarregar.

⚠️ **E um quarto, que foi a SUÍTE se sabotando** — o mesmo que a de
densidade já tinha cometido: o `addInitScript` apagava `cdf-uso` em **toda**
navegação, o reload do próprio teste incluído. Contexto novo já nasce com
storage limpo, então não havia o que apagar. A suíte passou também para a
origem http, pela regra que já valia: **suíte que recarrega nasce em http.**

---

## Armadilhas deste código

Custaram tempo. Todas já morderam pelo menos uma vez.

1. **`data-theme` pertence ao host do artifact.** O toggle manual usa
   `.app-light` (plataforma), `.pitch-light` (deck), `.claro` (hotsite/plano).
2. **Colisão de classe modificadora.** `.et.ok`, `.fl.ok`, `.vitem.fim2`,
   `.leitura.ok` — um modificador que também existe como classe raiz (ou como
   base de outro componente) herda layout que ninguém pediu. `test/colisao.js`
   detecta as duas formas e tem autoteste: `AUTOTESTE=1 node test/colisao.js`
   semeia o defeito e a guarda tem que acusar.
3. **Colisão de atributo, que a guarda ainda NÃO cobre.** `data-ir` significa
   *aba* dentro da gaveta e *passo do cadastro* num `querySelectorAll` global que
   faz `irPasso(+valor)`. Antes de reusar um `data-*`, procure no arquivo.
4. **`encodeURIComponent` não escapa parênteses.** SVG com `hsl(...)` num
   `url()` termina no primeiro `)`. Sempre
   `.replace(/\(/g,"%28").replace(/\)/g,"%29")`. **Falha em silêncio** — nenhum
   erro de console, a imagem só não aparece.
5. **`visibility:hidden` não tira do layout.** Gaveta fechada esticava a página
   no mobile; resolvido com wrapper que faz clip.
6. **`min-width:0` em filho de grid**, senão estoura na horizontal.
7. **`padding: X 0 Y` num `.wrap`** zera o padding horizontal e no mobile o texto
   encosta na borda. Já corrigido em 12 seções — hoje o template não tem nenhuma
   sobrando (`grep 'style="padding:[0-9]*px 0 '` devolve zero). Não reintroduza.
8. **`CSSStyleRule` tem `.cssRules`** (lista vazia, mas *truthy*) desde que o
   Chrome ganhou CSS aninhado. Um `if(r.cssRules) return` numa varredura de CSS
   devolve zero seletor e a ferramenta morre em silêncio. Foi o que aconteceu com
   o `colisao.js` por várias sessões.
9. **Ordem de declaração vence entre funções de mesmo nome.** Duas
   `drawPortfolio` fizeram o lightbox do perfil público abrir o editor. Antes de
   criar uma função, `grep` pelo nome.
10. **Ordem de declaração vence entre modificadores no mesmo elemento.**
   `class="btn mg gh"` queria magenta fantasma e saiu magenta sólido porque
   `.btn.mg` está depois de `.btn.gh` na folha — mesma especificidade, ganha a
   última. Combinação de dois modificadores precisa da regra própria
   (`.btn.mg.gh`), declarada **depois das duas**.
11. **`data-*` duplicado quebra o *teste*, não a página.** Pôr um segundo
   `data-ajuda="moeda"` na home (o botão "Como o take funciona") deixou dois
   elementos com o mesmo atributo. A página funciona — o wiring é
   `querySelectorAll`, os dois botões passam a levar ao mesmo artigo, que é
   exatamente o desejado. Quem quebrou foi o Playwright, que é *strict mode*:
   `locator('[data-ajuda="moeda"]')` com dois resultados é erro. Ao reusar um
   `data-*` que já existe, procure no `test/` antes: o seletor de lá precisa
   ganhar um qualificador (`.gitem[data-ajuda="moeda"]`).

### Editar o template com script Python

O template tem ~6.500 linhas; edição por script é mais segura que por mão. O
padrão que funciona:

```python
def sub(a,b,n=1):
    global s
    assert s.count(a)==n,(s.count(a),a[:90]); s=s.replace(a,b)
# ... vários sub() ...
open(p,"w",encoding="utf-8").write(s)   # write() SÓ no fim
```

O `assert` antes do `write()` faz um casamento errado descartar o script inteiro
em vez de deixar o arquivo pela metade. Use âncoras ASCII quando puder — acento e
espaço em fim de linha já quebraram vários.

---

### A moeda take na home (17/ago)

O take existia só dentro da ajuda, onde entra quem já é de casa. É o argumento
mais visual da plataforma — um disco de alumínio girando convence mais que um
parágrafo sobre custódia — e quem chega na home não sabia que existe moeda
própria. A seção `#h-moeda` fica entre o sinal/contrato e "para quem é": o texto
de um lado, a moeda em 3D do outro, câmbio fixo `T$ 1 = R$ 1,00` em caixa
própria e três fatos (nasce de recebimento, vira Pix sem taxa, não vence).

**O motor deixou de ser um só.** Antes havia um `moedaLoop` global e um
`#cv-moeda` fixo: abrir a segunda moeda matava a primeira. Agora
`montarMoeda(id, vivo)` aceita qualquer canvas e guarda o `requestAnimationFrame`
em `moedaLoops[id]`; `vivo()` é o predicado que decide se continua. A da ajuda
usa `!v("v-ajuda").hidden`; a da home usa `!v("v-home").hidden && moedaHomeVis`,
onde `moedaHomeVis` vem de um `IntersectionObserver` — girar atrás da dobra é
bateria queimada à toa. `cv.dataset.w/h` guardam o tamanho lógico porque montar
duas vezes no mesmo canvas dobraria o `devicePixelRatio` a cada vez.

O desenho é o mesmo da ajuda (`fabricarMoeda`), e continua sendo — trocar a
moeda é trocar `MOEDA`, nada mais.

### A travadinha do carro (17/ago)

Relatada no clique de "Escala completa" em Montar equipe. Quatro coisas
empilhadas no mesmo frame:

1. **`#pista` era `display:none`.** Ligar o display no instante em que a
   animação começa obriga layout + primeira rasterização do SVG (15 formas,
   stroke, gradiente) dentro do primeiro frame. Agora a pista fica sempre
   montada com `visibility:hidden` e o carro descansa em `translateX(-240px)`;
   o que liga é `visibility` e a animação, não o layout.
2. **As rodas giravam `infinite` para sempre.** Animação em SVG com
   `transform-box:fill-box` não vai para o compositor: era repaint a cada 180ms
   o tempo todo, com a pista escondida. Passou para `#pista.on .carro .roda`.
3. **A troca de tela era síncrona.** `drawPassar()+show("passar")` rodavam logo
   depois do listener de captura que dispara a animação, comendo justamente o
   primeiro frame. Foram para o `requestAnimationFrame` seguinte: o carro
   arranca limpo e a tela troca por baixo dele.
4. **O carro saía sem ter o que anunciar.** Com a escala cheia o clique só
   trocava o rótulo, mas a travessia de tela cheia acontecia assim mesmo.

**E aí o carro voltou, dentro do botão.** Tirar a travessia estava certo — era
1,45s ocupando o app inteiro para dizer que não há o que fazer —, mas tirar o
carro por completo deixou o clique mudo, e o Victor sentiu falta na hora. Então
`carroNoBotao()`: o mesmo carro atravessa o próprio `#e-passar` em 0,9s, a 44px,
clipado pela borda. **A assinatura fica na escala do que aconteceu.**

**E a travessia grande mudou de botão.** Ela estava no `#e-passar`, que só LEVA
para a tela de Passar o carro — ali ninguém passou carro nenhum, a chamada nem
foi montada. A ação de verdade é o **`#u-send`**, que dispara a chamada para quem
está na escuta, e é onde a buzina e o motor já tocavam. Hoje:

| Botão | O que acontece | Assinatura |
|---|---|---|
| `#e-passar` (Montar equipe) | leva para a tela de Passar o carro | carro pequeno dentro do botão |
| `#u-send` (Passar o carro) | **a chamada sai** | travessia de tela cheia |

O som não dobra: `enviar()` já tocava buzina + motor, e agora o motor vem de
dentro do `passarOCarro(atrasoSom)`, com o mesmo atraso de antes.

Anima `left`, não `transform`: o alvo é a largura do botão, e `translateX` em %
mede a largura do carro. Um SVG de 44px repintando por 0,9s não paga o custo de
fazer conta com a largura em JS. ⚠️ O botão agora tem um `<i>` com SVG dentro,
então **`textContent` nele apaga o carro** — todo rótulo passa por `rotPassar()`,
que escreve só no `<span class="rot">`. Havia três lugares escrevendo direto.

### A lista de guildas sai dos dois perfis (17/ago)

O diretório ganhou aba própria (Guilda, no topo e no menu de baixo). Repetir a
mesma lista dentro do perfil só alongava o perfil e criava dois caminhos para a
mesma coisa. Saíram os blocos `#mp-gui` (perfil de quem contrata) e `#pr-guib`
(perfil do freela) junto com `pintarGuildaProd()` e `pintarGuilda()`. Quem
procura guilda vai na aba.

### Time da guilda em Montar equipe — por que ele não aparecia (17/ago)

O bloco era vitrine: mostrava quem o grupo aprovou e não deixava clicar. Virou o
mesmo botão `.tp` com `data-tf` do "Meu time" — um wiring só serve aos dois
blocos. Mas o Victor continuou sem ver nada, e o motivo eram **três coisas
empilhadas**:

1. **Sem guilda, `blocoGuildaTime` devolvia `""`.** Quem ainda não entrou em
   nenhuma não via nem que a coisa existe — e ninguém nasce numa guilda. Agora
   o lugar do bloco traz o convite (`.guconv`) com botão para a aba Guilda.
2. **Com guilda, o time nasce vazio e não havia como enchê-lo dali.** A única
   porta era voltar para a busca e marcar estrela. Agora o estado vazio lista os
   **seus favoritos com um botão "Aprovar"** (`data-gaprov`, `.tp.gapv`): quem
   você já confia vira gente que o grupo inteiro pode escalar, sem sair da tela.
   O bloco cheio mantém a mesma porta no rodapé, para os favoritos que ainda não
   passaram pela guilda.
3. **O wiring de `[data-tf]` só rodava no caminho de quem TEM favorito.**
   `drawMeuTime` tem duas saídas e a de cima retornava antes de ligar os
   handlers — os botões do bloco da guilda nasciam mortos justamente para quem
   mais precisava deles. A ligação virou `ligarMeuTime(el)`, chamada nas duas.

O cabeçalho passou a dizer **quantos membros a guilda tem**, que era a palavra
que o Victor usou. Cuidado com a distinção de vocabulário: *membro* é gente
dentro da guilda (`membrosGuilda()`); *time* é a lista de freelas que a guilda
aprovou para escalar (`GUILDA_TIME`). São coisas diferentes e a tela diz as duas.

**A regra de dado continua de pé:** ninguém real é semeado numa guilda. Quem
entra no time entra por ato do usuário — a estrela na busca ou o botão de
aprovar —, nunca por dado de demonstração. Por isso o convite usa `.guesc`
(escudo neutro) e **não** `.bras`: quem não tem guilda não tem brasão, e o
seletor `.bras` continua significando exatamente "aqui tem guilda".

### Fluidez — o que o Maestro faz e aqui faltava (17/ago)

Tudo atrás de `prefers-reduced-motion`:

- `html{scroll-behavior:smooth}` + `scroll-margin-top` nas âncoras (a barra é
  sticky: sem margem a âncora encosta embaixo dela e some). Cuidado: `.sec` já
  tinha `scroll-margin-top:70px` mais adiante na folha e vencia — hoje é uma
  regra só, 76px.
- Seções da home sobem ao entrar na tela (`.rvsec .wrap` → `.rv`, filhos
  escalonam com `--d`). O observador revela quem entrou **e quem já passou por
  cima** (`e.isIntersecting || e.boundingClientRect.top < 0`): um pulo de âncora
  atravessa seções inteiras sem intersectar, e sem essa segunda condição elas
  ficam em branco na volta.
- A barra da home condensa depois do primeiro rolar (`.homenav.densa`).
- `::selection` na cor da casa e levantar no hover onde faltava.

### Tempo real: os dois avisos de quem não está olhando (17/ago)

Pedido do Victor, e a razão dele é de operação, não de enfeite: **o
contratante que passou o carro está no meio de outra coisa.** Se a resposta só
aparece quando ele lembra de olhar a tela, ele continua ligando para gente por
fora — que é exatamente o comportamento que a plataforma existe para substituir.
Do outro lado, o freela não sabe que a chamada existe até abrir o app.

Dois sons novos, e são **os únicos da paleta que existem para chamar quem NÃO
está olhando** — por isso são mais longos e mais altos que o resto:

| Som | O quê | Quando |
|---|---|---|
| `aceitou` | terça maior subindo + cauda de sino | alguém pegou a vaga |
| `chegou` | duas batidas na porta + buzina abafada ao longe | chamada nova na caixa |

**Som nunca vem sozinho.** Metade das pessoas navega com o som desligado, e quem
ouviu sem olhar precisa saber do quê: todo som de chamada vem com um **aviso
flutuante** (`avisar({t,sub,tipo,som,ir})`, `#avisos`, `.avz`) que fica alguns
segundos, diz o que aconteceu e leva para a tela certa com um clique. Máximo de
três empilhados — mais que isso vira parede.

**A porta única é `chamadaChegou(prop)`.** Toda chamada nova passa por ela, e é
ela que empilha em `PROPOSTAS`, redesenha e avisa. Centralizado de propósito: se
cada lugar que cria proposta tivesse que lembrar de avisar, um ia esquecer — e o
que falha em silêncio aqui é justamente a notificação. Ela checa o `MODO`: **de
chapéu de contratante ninguém é avisado da chamada que acabou de mandar.**

**Ouvir o outro lado sem segunda conta.** O Victor levantou que só consegue
estar numa conta por vez, então o par de avisos — que só existe quando duas
pessoas usam ao mesmo tempo — é justamente o que ele não conseguiria testar.
`#pp-sim` ("Simular uma chamada chegando agora") entra na mesma linha `.eco` que
já explicava a volta da consulta para a caixa, põe o chapéu de freela e dispara
uma chamada de demonstração completa. Os contratantes dela são fictícios
(Produtora Maré, Agência Barlavento, Coletivo Rebojo), como manda a regra.

### A freada do carro (17/ago)

`atravessa` tinha quatro quadros: `-240px → 46vw → 54vw → 100vw`. **O CSS aplica
a curva de easing entre CADA PAR de quadros, não na animação inteira** — então o
carro desacelerava chegando aos 46%, andava 8vw em 87ms, e voltava a acelerar.
Era literalmente uma freada no meio da pista, e os quadros do meio só existiam
para dar o solavanco em Y.

A separação resolve: o X virou **um par de quadros linear** na propriedade
`translate`, e o solavanco virou animação própria em `transform`. As duas
propriedades são independentes e compõem sozinhas.

Medido: desvio da reta caiu de **12,8% para 4,6%** do percurso (`tempo-real`
tem a asserção). Medir posição contra a reta é imune a frame perdido; medir
velocidade instantânea não é, e a suíte roda junto com as outras 28.

### Inventário de equipamento (17/ago)

Ideia do Victor, e ela resolve um gargalo que já estava no código: **a parte
cara de anunciar é a ficha de conservação**, e quem já preencheu uma vez não
deveria preencher de novo. O inventário é o lugar onde a ficha mora, e o
anúncio passa a nascer dela.

Mora dentro do Brechó (`data-bp="inv"`), que é exatamente onde ele fica no
fluxo: a lista vem antes da venda. Vale para os dois lados — contratante tem
equipamento parado igual.

**De onde vem o estoque inicial: do que a conta já declarou.** Os anúncios do
dono viram itens com ficha pronta; as câmeras e lentes que ele digitou no
perfil viram itens **sem** ficha. Nenhuma peça inventada — a regra de não
atribuir equipamento a pessoa real vale para o dono da conta também, e "ficha
incompleta" é o que acontece de verdade com quem nunca preencheu. Há teste
verificando que toda peça é rastreável a um anúncio ou ao texto do perfil.

**Status é DERIVADO, nunca guardado** (`statusInv`): `fora` se há registro de
aluguel aberto, `vendido`/`venda` conforme o anúncio ligado, `guardado` no
resto. Menos um lugar para dessincronizar — e é o que garante que peça que
está na mão de outra pessoa não pode ser anunciada como disponível.

**A estimativa NÃO é "avaliada por IA", e a tela não diz que é.** O Victor
pediu IA; a plataforma não tem IA e inventar uma seria o tipo de mentira de
UI que este projeto trata como bug. O que ela tem é melhor para a decisão de
vender: `avaliar()`, o mesmo motor do anúncio — depreciação por categoria e
idade, mais uma penalidade por campo da ficha, **com a conta aberta item a
item**. Um número que a pessoa confere linha por linha convence mais na hora
de pôr preço do que um número que ninguém explica, e não coloca a plataforma
na posição de avaliadora. É um motor só, não dois: há teste comparando.

**"Fora de casa" registra quem, desde quando, até quando, por quanto**, e a
conta do período sai sozinha (diária × dias, semana, mês). Nasceu como registro
privado; o Victor pediu a formalização logo depois, e ela virou a seção abaixo.

**Editar anúncio passou a existir.** `nv-ok` só sabia criar; agora `nvEditId`
decide entre `Object.assign` no anúncio existente e criar um novo. Recriar
zeraria dias no ar, impulsionamento e propostas recebidas em silêncio.

⚠️ **Acento:** doze cartões com botão ciano seria o "acento em tudo" que a casa
já corrigiu uma vez. Sólido só em "Anunciar", e só quando a ficha está
completa — ou seja, quando ele é clicável de verdade. Os ícones de categoria
(`ICO`) vêm com `stroke:var(--ciano)` embutido e são repintados para
`--cal-tenue` no card: ícone é identidade, não ação.

### Posse anda com a peça (17/ago)

`it.dono` passa a existir. Mudar de dono é **um evento**, nunca duas pessoas
editando duas listas — o que evita o estado impossível de "o vendedor já tirou
da lista dele e o comprador ainda não pôs na dele". Três portas para o mesmo
`transferirItem()`:

| Porta | O que acontece |
|---|---|
| Venda liberada no brechó | `transferirPelaVenda()` dentro de `liberarVenda()` — sai de quem vendeu **e** entra em quem comprou, com a ficha do anúncio já preenchida |
| Botão **Transferir** | doação, troca, venda por fora, sócio que ficou com a peça |
| Compra liberada | a peça nasce no inventário do comprador, ficha inteira, sem redigitar |

O que sai **não some**: vira o bloco "Saiu do seu inventário", com para quem,
por quê e quando. *"Onde foi parar aquela lente"* é pergunta de seis meses
depois. `invItens()` filtra por `dono===EU.id`; `invTodos()` existe para os
handlers acharem o que já saiu.

### Contrato de locação de equipamento (17/ago)

A dor, nas palavras do Victor: quem empresta tem medo de a pessoa não devolver
ou de o equipamento voltar danificado **"e ficar por isso mesmo"**. O que
resolve isso não é dinheiro retido — é **prova**. Sem documento assinado e sem
registro do estado na entrega, vira palavra contra palavra e ninguém cobra
ninguém.

O que a plataforma entrega, e é o que a tela promete:

1. contrato com as duas partes qualificadas (locador/locatário), prazo, valor,
   cláusula de conservação e devolução, foro;
2. **o estado na entrega anexado** — a ficha de conservação que já está no
   inventário, congelada em `contrato.fichaSaida`. **Este é o item que ganha a
   discussão de "voltou arranhado"**: os dois assinaram concordando com o
   estado de saída;
3. duas assinaturas pelo gov.br, com data e hora (simuladas, e a tela diz);
4. **conferência na devolução** (`ovl24`), comparando campo a campo com a ficha
   de saída e apontando o que piorou.

**O que ela NÃO faz, escrito em `.limite` no topo do contrato:** não retém
valor, não cobre dano, não devolve equipamento e não cobra por ninguém. Quem
cobra é o dono, com o contrato na mão. Chamar isso de garantia seria vender
seguro sem ser seguradora — e o projeto já recusou coisa menor por motivo
igual. Foi o próprio Victor que enquadrou assim ("não é garantia da
plataforma, é uma oficialização em contrato"), e a implementação segue à risca.

**Taxa: `TAXA_CONTRATO=5`% do valor do período, uma vez, com piso
`PISO_CONTRATO=15`.** Paga por quem formaliza, porque quem formaliza é quem
quer o documento — e é ele que decide se vale. O piso existe porque emitir
documento tem custo fixo: 5% de um empréstimo de R$ 80 não paga o papel.

⚠️ **Armadilha 11 de novo.** Reusei `.naovende` na caixa de limite do contrato
e a suíte `take` quebrou com strict-mode violation (dois elementos). `.naovende`
significa "não vende take"; o limite do contrato é outra afirmação e ganhou
`.limite`, classe própria (o `grep` antes deu zero).

### Catálogo de aluguel (17/ago)

O contrato resolveu a segurança do aluguel, mas não o **encontro**. Nas palavras
do Victor: *"sem isso, a pessoa precisa entrar no perfil do dono do equipamento
às cegas."* O catálogo (`data-bp="alugar"`) faz para a locação o que o brechó
já fazia para a venda.

**Uma lista só, `catalogoAluguel()`, com duas origens.** As peças do meu
inventário que marquei para alugar (`it.locacao`) — dado real, sai do inventário
de verdade — e `LOC_DEMO`, sete anúncios de demonstração de outras contas, com o
**mesmo banner que o brechó já usa**. Sem eles o catálogo abriria vazio e
ninguém entenderia para que serve.

**Disponibilidade é derivada** (`locLivre`), como todo o resto do inventário:
quem está fora de casa não aparece como livre, e a data de volta é o que o
catálogo mostra. **Não existe calendário de reserva futura** — inventar um seria
prometer agenda de locadora que a plataforma não opera.

**Pedido é solicitação, nunca reserva.** Quem tem a peça decide caso a caso,
porque emprestar equipamento é decisão de confiança e nenhum sistema deveria
tomá-la sozinho. O ciclo completo:

| Lado | O que acontece |
|---|---|
| Quem precisa | pede com datas e para quê → aviso "pedido enviado", nada muda de mão |
| Quem tem | o pedido cai em `PEDIDOS`, bloco no topo do inventário, com **Topar / Recusar** |
| Topou | vira o `it.aluguel` que já existia → **o contrato de locação já construído entra aqui** |
| Quem pediu | a peça entra em `PEGUEI`, bloco "Comigo, de outra pessoa", com data de devolver |

**`precoPeriodo()` escolhe o pacote mais barato que couber.** Quem aluga uma
semana não deveria pagar sete diárias porque o formulário não sabe somar. Há
teste garantindo que 7 dias nunca custam mais que 7 diárias.

**A referência de diária é 1% do valor estimado da peça** — regra de bolso do
mercado de locação, calculada a partir do `estimarInv()` que já existia. A tela
diz "é só referência: quem põe o preço é você". Mesma postura da estimativa de
venda: conta aberta, nunca tabela imposta.

⚠️ **Acento, de novo.** Cinco cartões com botão ciano cheio viraram parede. Numa
grade de escolhas **nenhuma opção É a ação primária** — o acento fica para o
"Enviar pedido" dentro do modal, que é onde a pessoa se compromete. Os botões da
grade são todos fantasma.

**O que a plataforma não é, escrito em três lugares** (cabeçalho do catálogo,
modal do pedido, contrato): não é locadora, não guarda, não entrega, não confere
e não retém valor. Mostra quem tem, aproxima e emite o contrato se os dois
quiserem.

### O comparativo no centro de Montar equipe (18/ago)

Pedido do Victor: quem é livre e abre Montar equipe vê **os planos no
centro da página, lado a lado, com comparativo**. A vitrine trancada estava
num cartão à esquerda com dois cartõezinhos no fim; virou `painelTrancado`
com `cmp:true` — o cartão centraliza (`.tcentro`, 980px) e os planos viram
a tabela `.cmp`: Carona / Volante / Frota em colunas, a diferença linha a
linha (`CMP_LINHAS`, a mesma tabela deste arquivo), "você está aqui" no
Carona e Assinar nos pagos. A coluna do Volante leva o único acento. Com o
comparativo, a lista de ✓ sai — dizer duas vezes é ler duas vezes. No
celular a tabela rola no próprio trilho (`.cmp-rol`), nunca a página. As
outras trancas (busca, agenda de perfil, passar) continuam com `.doisp`.
No menu, **Sua conta subiu**: logo depois de Começo, antes de Operação.

### O plano do freela passou a trancar (19/ago)

Análise pedida pelo Victor depois de tudo pronto. O achado: **`PLANO_FREELA`
cobrava e não abria porta nenhuma** — nenhuma tela consultava o valor, e das
cinco linhas do Premium **quatro não estavam construídas**. Do lado de quem
contrata era o oposto (`ASSINANTE`/`PREMIUM_PROD` trancam de verdade).

O que mudou:

- **Estrada abre o Orçamento.** A aba fica visível para os dois lados; do
  lado do freela sem Estrada ela mostra a vitrine trancada
  (`painelTrancadoFreela`), mesmo padrão de Montar equipe — esconder faria
  o plano ser um segredo. `podeOrcar()` = contratante **ou** Estrada.
  Racional: *"tem muito freela que pega trabalho também, mas não é
  produtora"* — esse freela orça direto para o cliente final, e é
  exatamente quem a Estrada descreve.
- **Premium abre o relatório do ano** (`relatorioFreela`, `csvFreela`,
  `#pf-rel` em Meu perfil): de onde entrou o dinheiro, por contratante e
  por função, somando **job + brechó + aluguel** — três origens, uma conta
  só, que é como o mês do freela acontece. É o espelho do relatório de
  custo do contratante, do lado de quem recebe.
- **As listas dos planos ficaram honestas**: saíram "recibo automático",
  "clube de desconto" e "quantas vezes apareceu em busca" (nada disso
  existe); entrou o que existe.
- ~~**Orçamento continua grátis para quem contrata** (Carona)~~ — **revertido
  no mesmo dia**, ver abaixo.

### A brecha do chapéu trocado (19/ago · 4) — quem viu foi o Victor

O orçamento tinha nascido grátis do lado de quem contrata: a ideia era que
ele acontece ANTES de contratar, então a pessoa ganharia o cliente com a
ferramenta e esbarraria no Volante na hora de procurar equipe. Só que
**a conta de contratante é a mesma pessoa**, com um botão de trocar de
modo. O freela que quisesse orçar não precisava da Estrada: bastava virar
contratante no Carona (grátis) e orçar de lá. A Estrada virava letra
morta — um plano de R$ 49 cuja única porta abria de graça na porta ao lado.

```js
const podeOrcar=()=>(MODO==="contratante"&&ASSINANTE)||PLANO_FREELA==="estrada";
```

Orçar é de **plano pago dos dois lados**. Do lado de quem contrata a
tranca abre no **primeiro plano pago** (Volante), não na Frota — a decisão
do Victor foi explícita: *"deve ser liberada pelo menos no primeiro plano
pago"*. O Carona continua sendo o que sempre foi: chamar quem você já
conhece e fechar com contrato.

Quando a tranca é do lado do contratante, ela usa `painelTrancado({cmp:true})`
— o **comparativo dos três planos**, o mesmo de Montar equipe. Não é
vitrine nova; é a que já existia, no lugar onde a pergunta aparece.

⚠️ **E um defeito que o mesmo recado trouxe:** assinar de DENTRO de uma
tela trancada cobrava o plano e deixava a porta fechada. Os dois modais de
assinatura mudavam o estado e redesenhavam Planos, mas nunca a tela por
trás — para o Victor pareceu que a assinatura não tinha pegado. O conserto
mora nos dois `ok`:

```js
if(S.tab==="orcar") drawOrcar();
if(S.tab==="meu")   pintarRelFreela();
```

**A regra geral:** *toda tela que tranca precisa se redesenhar quando o
plano muda.* Quem assina de dentro da tranca tem que ver a tranca abrir,
sem sair e voltar. Se amanhã outra tela ganhar tranca, ela entra nesta
lista — senão o defeito volta com outro nome.

### A escada de níveis (19/ago · 6) — a lei do acesso

Tapar a brecha do orçamento resolveu o caso e não a classe. O Victor
generalizou, olhando o botão *"Levar as funções para Montar equipe"* na
tela do freela que acabara de comprar a Estrada: *"ele não precisa desse
botão, pq ele ainda não é contratante... eu vejo os planos como uma
escada de nível. Assim um não tem como burlar criando uma conta do outro
lado pra ter um serviço que só tem no outro."*

| degrau | plano | preço |
|---|---|---|
| 0 | Freela · Carona | grátis |
| 1 | Premium | R$ 19 |
| 2 | Estrada | R$ 49 |
| 3 | Volante | R$ 89 |
| 4 | Frota | R$ 189 |

**Um degrau tem tudo dos degraus abaixo, dos dois lados.** Quem paga o
Volante recebe o Premium e a Estrada junto — e por isso *ninguém assina
dos dois lados*. O preço sobe com o degrau, então não existe combinação
que entregue mais por menos: é a monotonia da escada que fecha a brecha,
não uma trava caso a caso.

```js
const DEGRAU={base:0,carona:0,premium:1,estrada:2,volante:3,frota:4};
const NIVEL={GRATIS:0,PREMIUM:1,ESTRADA:2,VOLANTE:3,FROTA:4};
const nivel=()=>Math.max(DEGRAU[PLANO_FREELA]||0,DEGRAU[planoAtual()]||0);
const temNivel=n=>nivel()>=n;
```

⚠️ **`ASSINANTE` e `PREMIUM_PROD` continuam existindo, mas mudaram de
papel:** são o *armazenamento* do degrau do lado contratante, não mais a
pergunta. Quem quiser saber se uma tela abre pergunta `temNivel(...)`.
**Tela nova que tranca entra por aqui** — se ela perguntar a `ASSINANTE`
direto, a escada volta a ter um degrau que ela não conhece.

Os três portões hoje:

```js
const podeOrcar    = () => temNivel(NIVEL.ESTRADA);
const podeVerAgenda= () => MODO==="contratante" && temNivel(NIVEL.VOLANTE);
/* relatório do ano em pintarRelFreela */ if(!temNivel(NIVEL.PREMIUM)){ … }
```

O `MODO` sobreviveu só em `podeVerAgenda`, e com um papel diferente: **o
degrau diz SE abre, o modo diz ONDE**. Agenda alheia é tela de quem
contrata; o degrau é da pessoa e não muda quando ela troca de chapéu.

**Três coisas que a escada obrigou a mudar na tela, e a terceira é a que
mais importa:**

1. **O botão de Montar equipe sumiu do orçamento abaixo do Volante.** No
   lugar dele vai a razão — *"Orçar é o seu degrau. Escalar é o Volante, o
   degrau seguinte"* — porque um botão que some sem explicação vira dúvida,
   e a explicação aqui é a própria régua do produto.
2. **A taxa passou a ser chamada pelo nome do plano da pessoa.** A tela
   dizia *"Taxa de 6% do seu plano (Carona)"* para um freela que tinha
   acabado de pagar a Estrada — `planoAtual()` só enxerga o lado
   contratante. Agora `planoTopo()` devolve o plano mais alto que a pessoa
   tem, com empate desfeito pelo lado em que ela está.
3. **O painel trancado do orçamento virou UM só, para os dois lados, e
   vende a Estrada.** Antes o contratante no Carona via o comparativo dos
   três planos e era mandado para o **Volante de R$ 89** — mas com a escada
   valendo, a porta mais barata do orçamento é a **Estrada de R$ 49**, e
   ela vale igual de que lado a pessoa esteja. Mandar alguém pagar 89 pelo
   que custa 49 seria a tela mentindo sobre a própria regra que acabamos de
   escrever. O Volante aparece embaixo, pelo que de fato é: o degrau
   seguinte, para quem além de orçar vai escalar, com a frase *"não assine
   os dois"*.

E a escada é **dita**, não só aplicada: `#pn-escada`, na tela de Planos,
mostra os cinco degraus na ordem e onde a pessoa está. Sem isso a tela
mostra dois preços de lados diferentes e esconde que um contém o outro.

### A estrada (19/ago · 7) — a escada virou mapa

*"Pode até colocar uma forma de gamificação pra subir de nível... uma linha
de uma estrada e o carro chegando nos pontos (que são os planos), e quando
ele pega a conta maior o carro chega no destino final... som com buzina
quando chega em cada ponto, e quando chega no final a animação tem algo a
mais e um som de conquista. Se ele garante um plano sem ser em sequência, o
carro sai do início e vai até o plano direto que o usuário contratou."*
— Victor

`#pn-via`, na tela de Planos. Cinco paradas, o carro em cima, o asfalto
pintado até onde a pessoa chegou.

**As regras que o desenho obedece:**

- **O carro nunca teleporta.** Comprar a Frota estando no grátis faz o
  carro sair do começo e passar por Premium, Estrada e Volante, buzinando
  em cada um (`som("buzina")`), 560 ms por trecho. Os trechos do meio são
  `linear` (passagem); o último ganha `cubic-bezier(.2,.7,.3,1)` (freada).
- **O asfalto pintado anda junto com o carro** — mesma posição, mesma curva
  de tempo, por isso `viaPor(i,curva)` mexe nos dois. Quando só o carro
  recebia a freada, ele chegava antes da pintura e sobrava um pedaço cinza
  atrás dele.
- **Descer não é conquista.** Cancelar traz o carro de volta em UM
  movimento, sem parar nos pontos e sem buzina. Buzinar numa perda seria o
  produto comemorando o errado.
- **A linha de chegada existe desde o começo** (`.viachegada`, quadriculado
  no fim do asfalto), acesa só quando alcançada. Destino que só aparece
  quando você chega não é destino, é surpresa.
- **`prefers-reduced-motion`**: o carro é posto no lugar sem viagem. O som
  continua obedecendo só ao `SOM` da casa.

⚠️ **O CARRO E OS PONTOS NÃO PODEM DISPUTAR O MESMO PIXEL.** Na primeira
versão o marco era um círculo saltando para FORA do asfalto, com anel de
brilho, e o carro parava exatamente em cima dele: três cianos empilhados no
mesmo ponto. Agora o marco é um **furo DENTRO** da faixa (8 px numa faixa de
14) e o carro anda **por cima** dela — as rodas pousam na borda de cima e
nada se sobrepõe. **Quem diz "você está aqui" é o carro**; o furo é só a
marca da parada.

⚠️ **Segunda armadilha, e é de CSS puro:** `.viamarco` tinha
`transform:translateX(-50%)` **e** `margin-left:-42px`. Centrar duas vezes
some com metade da largura a cada ponto — os marcos iam escorregando para a
esquerda enquanto o carro (que só tinha o `transform`) ficava certo. Um
único método de centragem por elemento.

**Dois carros no produto, dois trabalhos diferentes:** o de `#pista` é a
**assinatura** da casa e mora só no botão que leva o nome dela; este é um
**indicador de posição** e mora só aqui. Nenhum dos dois se repete em outro
lugar — assinatura repetida vira ruído.

**`ABRE[]` é o DELTA de cada degrau**, não a lista acumulada do plano.
`#pn-prox` convida para o **degrau seguinte** — nunca para o mais caro — e
lista só as portas novas. Repetir o que a pessoa já tem transforma vantagem
em parede de texto. Tudo listado está construído: nenhuma porta pintada na
parede.

**Som novo: `conquista`.** A buzina da casa é uma terça maior (440/554); a
conquista é essa mesma terça virando acorde e subindo uma oitava — a buzina
que virou música, com a cauda de alumínio da `moeda`. Nada de fanfarra de
videogame: isto continua sendo uma estrada, e o carro acabou de estacionar.

⚠️ **A VIAGEM SÓ ACONTECE COM ALGUÉM OLHANDO** (19/ago · 8). Victor:
*"quando faz o pagamento do plano, eu não consigo ver a animação do
carrinho pq aparece uma mensagem na tela e a animação acontece enquanto tá
a mensagem. Coloca a animação pra acontecer assim que apertar o botão
'voltar aos planos'."* O recibo cobre a tela inteira; o carro corria atrás
dele e, quando a pessoa fechava, já tinha acabado. **Animação que ninguém
vê não é animação, é tempo gasto** — e o momento de maior orgulho do fluxo
(acabou de pagar) era justamente o que passava escondido.

```js
const viaVisivel=()=>S.tab==="planos"&&!document.querySelector(".ovl:not([hidden])");
```

`viaOnde` (onde o carro **está desenhado**) deixou de ser a mesma coisa que
`nivel()` (o degrau da pessoa). Entre pagar e ver, os dois ficam diferentes
de propósito — é essa diferença que a viagem gasta depois. A partida é
solta de dentro de `fecharAssinatura`/`fecharPF`, o que pega os três jeitos
de sair do modal: o botão "Voltar aos planos", o X e o clique no fundo.

E o teste **não é só o modal, é a tela**: quem assina de dentro do
orçamento trancado fica com a viagem guardada até abrir Planos. Nunca
acontece às escondidas.

⚠️ **Medir posição com a tela escondida dá NaN.** `#v-planos` fechada faz
todo `getBoundingClientRect()` devolver zero, e a conta de porcentagem vira
`NaN` — foi assim que a asserção da viagem guardada reprovou sem haver
defeito. Com a seção fechada, leia o `style.left` inline, que sobrevive.

**E um erro de português que o botão novo trouxe:** *"Subir para o
Estrada"*. Nome de plano tem gênero — a Estrada e a Frota são femininas.
`VIA_ART` guarda o artigo de cada degrau.

**De quebra, um erro de nome que a escada expôs:** `pintarClausulas` e
`pintarRelatorio` mandavam a produtora assinar o **"Premium"** — nome que
hoje é o plano de **freela** de R$ 19, que não abre nem cláusula nem
relatório de custo. As duas telas são do lado de quem contrata e falam do
plano de R$ 189: **Frota**. Agora leem `PLANOS.frota.nome`, para nunca mais
descolar do dado.

⚠️ **Dois defeitos achados no caminho, e o segundo é o pior:**
1. `pf-lista` estava **duplicado** — o modal do plano de freela escrevia os
   benefícios por cima de "Trabalhos publicados" no perfil. O modal passou
   ao prefixo `pfr-`.
2. **`test/colisao.js` via o id duplicado e não reprovava**: imprimia o
   relatório e saía com 0, então a bateria fechava 36/36 verde com o
   defeito no ar. Guarda que não reprova é registro, não guarda. Agora ela
   falha; os 8 conflitos de classe legados (heurística batendo em coisa que
   funciona) ficam numa lista `CONHECIDOS` — **qualquer novo reprova**.

### Orçamento a partir do roteiro (19/ago) — `v-orcar`

Pedido do Victor: a produtora responde um questionário sobre o job e a conta
se monta sozinha, **puxando o que a plataforma já sabe** — a base toda é a
plataforma. Entrada no mapa, lado contratante (`orcar`).

- **Fonte das diárias por linha**: média/piso/teto da `REFERENCIA` (a faixa
  da praça derivada dos cadastros), a **tabela publicada pelo nome** — só
  para quem publicou (`PRECOS.base`, no protótipo o perfil demo) — ou valor
  manual. A regra de não inventar diária de pessoa real vale aqui e tem
  teste contando as fontes nominais.
- **A conta, na ordem**: equipe (diária×qtd×dias, dias por linha podem
  diferir do projeto — editor fecha depois) → hora extra (cada hora acima
  de 10 vale **um décimo da diária**) → deslocamento por pessoa → outros
  custos → taxa do plano sobre a equipe (opcional, `planoAtual()`) → margem
  → **imposto POR DENTRO**: `total = sub/(1-i)`, e a tela explica por quê.
- **Margem e imposto são da produtora** — a plataforma não palpita; viram o
  padrão dela (`cdf-orc-padrao`) e voltam preenchidos no próximo orçamento.
- **"Sugerir funções pelo roteiro" é busca de palavras** (`ORC_PISTAS`),
  dita como tal na tela, mostrando QUAL palavra achou. Não é IA e não se
  anuncia como IA.
- **Gerar** produz o documento (`.doc` reusado) com a fonte dos valores
  declarada + **Copiar como texto** (WhatsApp/e-mail). **Levar para Montar
  equipe** expande as funções em `VAGAS` (uma por pessoa) e preenche o nome
  do job.
- **TIMBRE do contratante** (`ORC_TIMBRE`, `cdf-orc-timbre`): logo (a do
  perfil da produtora entra sozinha, upload sobrepõe via `lerImagem`),
  nome, rodapé (CNPJ/contato) e **cor da marca** — que pinta o fio do
  documento, identidade DELE, não da plataforma. Sai impresso no doc e no
  texto copiado; padrão sobrevive ao reload.
- **A mensagem do cliente rende mais que funções**: `orcSinais()` acha
  DIAS ("3 diárias"), TIPO (casamento→Casamento etc.), FORA DA CIDADE
  (pela lista de praças + praias da região — "Pipa" liga o deslocamento)
  e QUANTAS CÂMERAS ("2 câmeras" vira UMA linha ×2, sem duplicar com a
  sugestão de função). Cada chip mostra a palavra que o gerou.
- **Áudio do cliente**: upload + player para ouvir ali; a tela diz a
  verdade — transcrever é serviço de servidor, "fingir que transcreveu
  seria mentir". Quando houver backend, o áudio vira texto e cai no
  mesmo leitor. Nada finge.

#### Subir o documento do roteiro (19/ago · 16)

Pedido do Victor: *"Coloca uma opção na hora de fazer orçamento por roteiro,
de subir o documento do roteiro."* O buraco era óbvio depois de dito —
**roteiro chega como arquivo**, não como texto colado. Pedir que a pessoa
abra o `.docx` no celular e copie à mão é pedir o trabalho que a tela
existe para poupar.

- **`#oc-rotfile`**, ao lado do botão de áudio. `accept=ROT_EXT`
  (`.txt .md .markdown .fountain .fdx .rtf .docx .pdf .text`) — os
  formatos em que roteiro chega de verdade.
- **O texto sai do arquivo NO APARELHO**, sem rede. Roteiro é material
  confidencial de cliente; subir para servidor seria um risco que a
  função não precisa correr. A tela diz isso em letra fixa.
- **`DecompressionStream` é o que torna isso possível sem biblioteca.**
  `.docx` é ZIP: `textoDocx` varre os **cabeçalhos locais** (`PK\x03\x04`)
  até achar `word/document.xml` — menos código que ler o diretório
  central, e interessa uma entrada só — e infla com `deflate-raw`
  (`inflar` tenta `deflate` depois, para quem gravou com cabeçalho zlib).
  `.pdf`: infla cada `stream…endstream` e pesca `(…)Tj`, `[…]TJ`,
  `T*`/`Td`/`TD` para as quebras.
- **`pareceTexto()` é o guarda-corpo.** PDF com fonte em subconjunto
  devolve caracteres que não formam palavra nenhuma; despejar isso no
  leitor de palavras produziria **sugestão inventada** — a mentira mais
  cara desta tela. O filtro exige ≥75% de caracteres de texto e ao menos
  uma vogal. Reprovou: `.rotarq.nao3`, *"não consegui tirar o texto deste
  PDF — provavelmente é digitalizado"*, e **o arquivo continua anexado**.
- **Sem pipeline paralelo**: o texto extraído cai no MESMO `#oc-rot` que
  já existia e `lerRoteiroTexto()` roda sozinho. Daí para frente é
  `orcSinais()` + `ORC_PISTAS` de sempre. Subir um segundo arquivo
  **acrescenta**, não apaga o que a pessoa escreveu.
- **`ORC.roteiro={nome,tam,lido}`** sai impresso no documento: *"Roteiro
  anexado: X — texto lido pela plataforma"* ou *"— texto não extraído
  aqui"*. Nem para o cliente final a tela finge ter lido.
- Armadilha que mordeu: `limparXML` troca tag por espaço (para não colar
  palavra em palavra) e isso deixava **uma margem falsa em toda linha**
  do roteiro. `.replace(/ *\n */g,"\n")` antes de colapsar as linhas em
  branco.

### Dossiê de equipamento (19/ago · 9) — fase 1 do seguro

Pergunta do Victor: *"o que dá pra ser feito na plataforma para a dor de
seguro de equipamento?"* — com a hipótese de parceria com seguradora, e a
observação certa dele de que **a comissão vem da seguradora, não do
usuário**, porque o dado preciso é vantagem para ela.

**A linha não se move: a plataforma não vende seguro e não indeniza.** O
contrato de locação já tinha traçado isso (*"não retém valor, não cobre
dano, não devolve equipamento e não cobra por ninguém"*), e continua
valendo. Quem paga sinistro tem que ser seguradora com nome na apólice.

**O que ela pode fazer sozinha é a parte que ninguém consegue fazer:
PROVAR.** O motivo nº 1 de sinistro negado é não conseguir mostrar posse,
valor e o estado ANTERIOR ao dano — o freela tem a nota perdida no e-mail e
uma foto do Instagram. O inventário já guardava ficha de conservação,
estimativa com a conta aberta, cadeia de posse e o estado congelado na saída
do aluguel. Faltava juntar num documento e faltava o que registrar quando dá
errado.

**Duas peças:**

1. **Dossiê por peça** (`docDossie`, `prontidaoDossie`, `ovl28`). Barra de
   prontidão sobre cinco itens — série, nota fiscal, ficha, fotos, ano — e
   **cada um diz POR QUE importa**, não só que falta: *"sem nota, a
   indenização sai pelo valor que a seguradora arbitrar"*. É o que faz a
   pessoa preencher; checklist mudo ninguém completa. O documento reusa
   `.doc` (mesmo desenho do contrato e do orçamento) e sai como texto,
   porque o visualizador bloqueia download e o que ela vai fazer de verdade
   é colar no e-mail da corretora.
2. **Ocorrência** (`OCORRENCIAS`, `registrarOcorrencia`, `ovl29`). Quebrou,
   sumiu, caiu. **Congela `fichaNaHora`** — mesmo princípio da `fichaSaida`
   do contrato de locação: depois do estrago ninguém prova o antes. "Onde"
   já vem com os jobs da plataforma; o prejuízo já vem estimado. A tela
   manda **fazer o B.O. antes de qualquer coisa**, porque sem ele nenhuma
   seguradora abre sinistro.

⚠️ **Série e nota fiscal nascem VAZIAS em toda peça semeada, e isso é
decisão, não pendência.** Inventar número de série ou nota de equipamento
de gente real é a mesma mentira da diária inventada. **O buraco É o
produto**: o dossiê existe para mostrar que ele está lá.

⚠️ **Nenhuma ocorrência é semeada.** Ocorrência aponta o que quebrou e com
quem a peça estava — semear uma seria atribuir estrago a pessoa real.

De quebra, o empréstimo devolvido passou a virar `it.historico` em vez de
sumir: é linha de dossiê, e responde *"com quem essa peça já esteve"*.

**O que fica para as fases seguintes** (e é o roadmap que vai no deck):
cotação empacotando o dossiê para uma corretora parceira; e, com volume,
**apólice coletiva** — grupo de profissionais documentados comprando junto,
que é preço que ninguém consegue sozinho e é literalmente para isso que a
guilda existe. **Não criar "fundo de proteção" com percentual da taxa**:
isso é operação de seguro sem licença.

⚠️ **Armadilha nova, e é uma variação da nº 2: `.mdl .ok`.** O dossiê saiu
com todo texto centralizado porque existe `.mdl .ok{place-items:center;
text-align:center}` — o painel de sucesso dos modais. **As duas guardas do
`colisao.js` passaram batido**, porque `.ok` nunca é classe RAIZ aqui: ela
só existe como descendente de `.mdl`. Qualquer elemento com a classe `ok`
que caia dentro de um modal herda o centro, venha do componente que vier.

O `colisao.js` ganhou a **terceira guarda**: para cada regra `.X .Y`, se um
elemento tem a classe `Y`, está dentro de um `.X` e `Y` **não é a primeira
classe dele**, a regra do ancestral pega ele sem ninguém ter pedido. Como
ela não distingue composição de propósito (`.cmp .cplano` estilizando
`.ccab.cplano` é desenho) de herança por acidente, a lista de conhecidas é
**por REGRA, não por marcação** — cinco olhadas e aprovadas; regra nova
reprova e alguém olha. O modificador do dossiê virou `.dtem`, prefixado.

### O perfil como canal (19/ago · 13)

*"Demoreel no perfil, pegada canal do YouTube com um vídeo em destaque,
portfólio separado por categoria como se fosse playlists."* — Victor

⚠️ **O VÍDEO NÃO TOCA DENTRO DA PÁGINA, e a tela diz isso.** O produto roda
sem uma única requisição externa — é o que faz ele caber num artifact e
funcionar offline. Embed de YouTube quebraria a regra inteira. O que existe
é o que todo portfólio de verdade tem: **capa que a pessoa sobe + link que
abre fora**. Fingir um player embutido seria a mesma mentira de "avaliado
por IA". Sem link, o play avisa em vez de não fazer nada.

**As playlists não pediram dado novo:** `t.tipo` já vem de `TIPOS`, o mesmo
catálogo do orçamento e dos kits — um catálogo fechado pagando pela quarta
vez. Saem **na ordem do catálogo**, para dois perfis com os mesmos tipos não
saírem embaralhados. Sem filtro elas ficam **empilhadas** com o nome em
cima, que é como um canal se lê no celular — nada de rolagem lateral, que o
Victor já vetou uma vez e com razão. Com um tipo só, os chips somem: não
haveria o que escolher.

O editor mora no **passo 6 do cadastro**, ao lado do editor de portfólio;
Meu perfil mostra o estado e leva até lá. ⚠️ Cuidado: `#v-cadastro` é uma
VIEW separada de `#v-meu` — `show("meu")` não pinta os `.pn` do cadastro.
Quem pinta o editor do reel é `drawCadPasso()`.

**Álbum de fotos (19/ago · 14).** Victor: *"precisa ver também se o
profissional foi um fotógrafo, talvez pra ele subir um álbum de fotos."*
O número decidiu: **49 dos 109 cadastros marcaram Fotógrafo, 38 como função
principal** — um terço da base, não caso de canto.

⚠️ **ÁLBUM NÃO É PEÇA NOVA — é o que um trabalho JÁ É para um fotógrafo.**
A tentação era criar uma lista de "álbuns" ao lado dos "trabalhos". Seria
errado: a contagem do perfil, as playlists, o medidor de cadastro e a busca
teriam todos que aprender que existem duas coisas. É o **mesmo objeto com
outra forma**:

```
uma imagem  + link  → filme (o vídeo mora fora)
várias imagens      → álbum (as fotos moram aqui)
```

`fotosDe(t)` e `ehAlbumTrab(t)` são a régua; o lightbox `ovl2` virou álbum
navegável (setas, teclado, contador, miniaturas) e continua sendo o mesmo
lightbox para quem tem uma foto só. **Nada mudou para quem filma.**

O destaque do topo virou um **SLOT** (`r.tipo = "video" | "album"`), e a
assimetria é honesta: **o álbum ABRE dentro da página** porque imagem é data
URI e não pede requisição externa; o vídeo não abre, e a tela diz. Cada um
faz o que o produto consegue fazer.

**`fotografa(c)` dá o PADRÃO do editor, não uma trava.** Quem marcou
Fotógrafo abre no álbum; quem filma abre no reel; os dois podem trocar. A
plataforma não diz a ninguém o que ela é — mesma postura do gênero e da
softskill.

⚠️ **Contêiner e filho não podem ter a mesma classe.** `#lb-th` (a fita de
miniaturas) e cada miniatura dentro dela nasceram as duas como `.albth`, e a
regra `.albth .albth{display:none}` que eu escrevi para desempatar **escondia
as miniaturas** — `.albth .albth` (0,2,0) ganha de `button.albth` (0,1,1). É
a armadilha nº 2 vestida de outra roupa. Contêiner virou `.albths`.

### Ordem do dia e boletim de câmera (19/ago · 13)

*"Ordem do dia, boletim de câmera, ferramentas de documento pra
produção."* — Victor

**A ordem do dia é 80% DERIVADA, e é isso que justifica ela morar aqui** em
vez de num Google Docs: data, local, horário, chamada, equipe com função,
briefing e referências já estão no job. A produção preenche só o que a
plataforma não tem como saber — **estacionamento, refeição, hospital mais
próximo e contato de emergência**. Quatro campos em vez de uma página em
branco. (Hospital em ordem do dia não é enfeite: vai em toda ordem do dia
séria.)

- **Quem edita é quem contrata** — o documento é dela. O freela **abre e
  copia**, porque é ele que precisa dela no bolso às 6h.
- **Chamada por pessoa** (`chamadaDe`) cai para a geral quando vazia:
  elétrica chega antes, edição chega depois.
- O documento avisa para **gerar de novo se a escala mudar** — ordem do dia
  velha no bolso da equipe é o erro clássico.

**O boletim de câmera fecha o circuito que começou no inventário.** Ele
puxa a câmera **da lista de equipamento do job**, e a peça traz o **número
de série do dossiê** junto:

```
inventário → lista do job → boletim identifica a peça pelo número
                          → se der problema, a ocorrência já sabe qual era
```

Nenhum outro lugar do mercado liga essas quatro coisas. É a quarta vez que
preencher o inventário uma vez paga sozinho.

- **Um boletim por CORPO de câmera**, não por job: dois corpos na mesma
  diária são dois boletins, porque é assim que a ilha recebe.
- **O take se numera sozinho dentro da cena**, e a cena FICA no campo
  depois de lançar: na diária você repete a mesma cena várias vezes e
  ninguém tem mão livre para contar nem para redigitar.
- **OK e NG desmarcam no segundo clique** — errar no calor da diária é
  normal. NG marcado usa `.btn.mg.gh` (magenta fantasma): dois botões
  sólidos na mesma linha seriam dois acentos, e descarte não é a ação que a
  tela recomenda.

⚠️ **`#ovl34` (o boletim) abre sobre `#ovl33` (a lista de boletins)** e
precisou de `z-index:63` pelo mesmo motivo do editor de kit — ver a
armadilha dos modais empilhados.

### Lista de equipamento do job (19/ago · 10)

*"O freela controla os equipamentos que ele levou pro job e o que voltou,
pra saber se tudo que foi voltou. E a produtora controla tudo que foi de
equipamento da produtora. É mais pra ter um controle melhor. Facilita se
ligar isso ao inventário, assim ele só faz marcar os equipamentos que
foram."* — Victor

Entrada no **painel do job** (`v-jobs`), que é a tela que os dois lados já
leem. `blocoListaJob` mostra o placar e o botão; `ovl30` é a lista.

**Duas listas por job, uma de cada LADO.** `LISTAS` é chaveado por
`job + MODO`: o equipamento do freela e o da produtora não se misturam e
cada um confere o seu. No protótipo os dois chapéus são a mesma conta, o
que modela exatamente o que na vida real são duas contas.

**A lista pergunta "voltou tudo?", então o placar lidera pela FALTA** —
*"2 por voltar"* em magenta, e só depois a soma. Quem abre a lista no fim
da diária quer ver o buraco, não o total.

- **"Voltou" só existe depois de "Saiu"**, e desmarcar a saída zera a
  volta. Sem isso dá para conferir o retorno de uma peça que nunca saiu.
- **O que está comigo de OUTRA pessoa entra na lista** (`PEGUEI`): perder
  equipamento alheio é o caso pior, e é o que mais precisa de conferência.
- **O que não voltou vira OCORRÊNCIA**, já preenchida com o tipo, o job e a
  descrição — a mesma ocorrência do dossiê, que serve para cobrar, para o
  B.O. e para a seguradora. E ela **devolve para a lista** ao fechar: quem
  confere a volta está no meio dela e não pode perder o lugar.
- **Peça de terceiro que não voltou NÃO abre ocorrência sua.** O registro é
  de quem é dono; a tela manda avisar ele. Registrar perda de equipamento
  alheio no seu próprio dossiê seria dado errado no lugar errado.
- **`jobDaPeca(id)` é derivado**, como todo o resto do inventário: a peça
  está "em job" quando saiu numa lista e ainda não voltou. Nada de campo
  paralelo que dessincroniza.

⚠️ **"Em job" é MARCADOR, não trava** — e isto é uma **correção de rumo do
Victor** (19/ago · 15) sobre o que eu tinha feito no dia anterior. A versão
`· 12` transformou "em job" em STATUS e travava anunciar, alugar e
emprestar. Estava errado, e ele explicou por quê:

> *"Se entrar em job o anúncio continua. Ele pode ser vendido no sistema
> enquanto está no job; quando terminar, ele entrega o equipamento a quem
> comprou. Enquanto não tiver comprado, o equipamento continua sendo do dono
> e ele usa aonde ele quiser."*

**Job é ONDE A PEÇA ESTÁ HOJE, não um estado jurídico dela.** Vender é um
acordo entre duas pessoas com entrega combinada; alugar é agenda futura.
Nenhum dos dois exige a peça parada na estante agora. `statusInv` voltou a
não conhecer job; o que sobrou é a linha `.ivjob` no card, o fato "Em job
agora" no topo e o atalho para a lista.

**O que ficou do episódio, e é o que valia, foi a DATA.** O catálogo de
aluguel não faz a peça sumir: ele diz *"em gravação · livre a partir de 21
de agosto"*, e quem procura equipamento para daqui a duas semanas acha e
pede. `voltaEm` sai de três lugares, nesta ordem: **o que o dono escreveu**
(`locacao.livreEm`, campo novo no "Pôr para alugar" — é a palavra dele e
ganha de tudo), a volta do empréstimo em curso, e o fim do job. A nota sob o
campo diz de onde veio a sugestão: *sugestão sem procedência a pessoa apaga;
sugestão com motivo ela confere.*

E o filtro **"só o que está livre agora" nasce DESLIGADO**: com data de
disponibilidade, esconder o ocupado por padrão era o catálogo escondendo
metade de si mesmo.

### Feed, e a rede social virando a porta de entrada (20/ago · 4 a 8)

Victor: *"agora que tá virando uma rede social do audiovisual, vou ter que
criar um feed, pra que possam testar, curtir postagens, fazer comentários,
compartilhar no feed."*

**Eu tinha dito que não haveria feed, pelo motivo errado.** A regra da casa
nunca foi "não ter feed" — é **não fabricar conteúdo em nome de pessoa
real**. Guilda e coletivo já existiam funcionando assim.

Ele liberou o ponto em que eu tinha travado: *"não tem problema usar os
perfis que estão cadastrados, é só deixar o nome e uma abreviação da
primeira letra do sobrenome. Quando eu for lançar a plataforma vou zerar
todos os cadastros, cada pessoa vai entrar e cadastrar seu perfil."*

É chamada dele: são os contatos dele, a praça dele, e os cadastros morrem
no lançamento. Então o feed usa o CREW de verdade, com `nomeCurto()`.

⚠️ **O QUE CONTINUA VALENDO: o texto do post é escrito por esta casa, não
pela pessoa.** O aviso no topo diz isso com todas as letras (*"ninguém
publicou nada disso"*), e o conteúdo semeado fala só de **ofício** — nunca
cliente com nome, valor de diária ou juízo sobre outra pessoa. Um post
*"fulano me deixou na mão"* seria a regra #3 de volta, e há asserção que
reprova se aparecer.

⚠️ **A ABREVIAÇÃO JÁ EXISTIA NO BUILD**: `npm run build:anon` faz
exatamente isso. No feed ela é aplicada **sempre**, dos dois lados do
build, porque foi o que ele pediu; no resto do app o nome cheio continua, e
link público sai pelo anon (regra #4).

⚠️ **Post seu nasce com ZERO curtida.** Curtida de brinde na primeira tela
que a pessoa usa é a plataforma mentindo para o próprio dono da conta.

⚠️ **Autor não se repete.** Quem declarou câmera E drone caía nos dois
posts e o feed abria com o mesmo nome assinando duas coisas — parece
defeito. `_fdQuem` tira do sorteio quem já falou, e **prefere quem eu já
sigo**, senão a primeira tela depois do login abre pela metade.

#### Os tipos de post, e o que separa isto de um Instagram

| Tipo | Para quê |
|---|---|
| **Entreguei** | o que saiu — é o que faz alguém querer seguir |
| **Bastidor** | o que quase deu errado — é o que gera comentário |
| **Preciso de gente** | função, data, praça — **e ganha botão "Me chama"** |
| **Recado** | o resto |

"Preciso de gente" é o único lugar onde o feed encosta no trabalho. E
"Entreguei" com foto oferece **guardar no portfólio** — postar alimenta o
portfólio em vez de criar um segundo sistema de conteúdo que ninguém
mantém.

⚠️ **A caixa do portfólio EXIGE FOTO.** Antes ela salvava sem imagem e o
trabalho nascia com um frame genérico da casa como capa: a plataforma
inventando a imagem de um trabalho que a pessoa não fez.

#### Foto vira data URI, vídeo vira object URL

E a diferença é de peso, não de gosto. A foto passa pelo `lerImagem` da
casa (canvas, 1200px, jpeg .82): alguns KB, sobrevive à repintura, cabe no
arquivo único. **Vídeo em data URI seria o arquivo inteiro em base64
dentro da página** — um clipe de 20s estoura o protótipo sozinho.
`URL.createObjectURL` toca sem requisição externa (não é host, é o arquivo
do próprio aparelho, então a regra da casa segue de pé) e some no reload —
que é o que acontece com TODO o resto daqui, `POSTS` incluído.

Por isso **só foto vai para o portfólio**: um object URL morre no reload e
deixaria o trabalho com um buraco no lugar da capa.

#### "O compartilhar não funciona" — ele sempre funcionou

Victor relatou, e o diagnóstico é o que interessa. O post **era** criado, e
ia para o **topo** do feed, ordenado por data. Só que quem compartilha está
rolando lá embaixo: medido, o post novo nascia em **`top:-492`**, fora da
tela, ACIMA. Pior, a inserção empurrava a rolagem (987 → 1268), então a
página dava um pulo e o resultado ficava invisível.

`verPost(id)` leva a tela até o que a pessoa acabou de publicar, e vale
para os três caminhos: publicar, compartilhar e compartilhar do portfólio.
**Regra geral: coisa que nasce fora da vista precisa trazer a vista
junto.**

#### O trabalho do portfólio vai para o feed

⚠️ **Só o dono compartilha a própria peça, e a pergunta é sobre `t.dono`,
não sobre qual perfil está aberto.** Publicar peça alheia em nome de quem
clicou, num feed de nomes reais, é a regra #3 com outra roupa. E não
republica a mesma peça duas vezes.

#### A navegação: "Início" deixou de existir (20/ago · 7)

Victor: *"hoje a aba início tá abrindo as praças; em vez de ser início
coloca Feed, e que abra o feed mesmo — é a primeira página após fazer o
login. Faz uma aba praças, só que dentro do menu."*

**Rótulo que não diz o que abre ensina errado**: a aba se chamava Início e
caía numa lista de cidades. Hoje cada uma diz o nome da tela que abre, e
Praças foi para o grupo "O trabalho" no menu — que é o que ela sempre foi.

Isso **reverteu** a regra de 16/ago (*"o dia do freela começa em quem me
chamou"*). A razão nova é melhor: **Propostas só tem conteúdo quando alguém
te chamou, e na maioria dos dias ninguém chamou.** O feed tem conteúdo todo
dia — é o que faz valer a pena abrir o app num dia sem job.

⚠️ Consequência para os testes: **seis suítes clicavam em
`.tab[data-tab="pracas"]` ou caíam nela pelo login**. Todas passaram a
navegar com `show('pracas')`. A asserção que protegia a regra velha em
`acesso-a-agenda` foi reescrita para a nova.

#### Onde mora o compartilhado — a recomendação, ainda NÃO construída

Victor perguntou, e a preocupação dele é certa: *"tem que ter cuidado pra n
misturar muito pq o perfil do usuário também é o portfólio dele."*

**Portfólio é obra curada; feed é atividade.** A régua recomendada:

| | Portfólio (Trabalhos) | Publicações | Feed |
|---|---|---|---|
| Trabalho que subiu | sim | não | só se compartilhar |
| Post próprio | só se marcar a caixa | sim | sim |
| **Repost de outro** | **nunca** | **nunca** | sim |

**Repost nunca sai do feed** — o perfil é onde alguém decide contratar, e
repost é conversa, não obra. A aba "Publicações" separada de "Trabalhos"
resolve a mistura sem esconder que a pessoa está viva. **Aguardando o ok
dele.**

#### A moeda do pedágio (20/ago · 8)

*"Na aba do take fala sobre o pedágio também. E cria a moeda em 3D do
pedágio, assim como tem a do take. Colocar o quanto tem em pedágio na aba
de cima assim como tem o do take."*

⚠️ **`fabricarMoeda` passou a receber a LIGA em vez de clonar 130 linhas de
canvas.** Cores nos dois temas, símbolo, brilho e o que vai gravado na
cara. Moeda nova é um objeto (`LIGA_TAKE`, `LIGA_PEDAGIO`), não um arquivo
— e as duas envelhecem juntas.

**Latão, não alumínio**: o pedágio vive na família âmbar de `--segurando`,
a cor que ele já tem em toda tela. Duas moedas do mesmo metal seriam a
mesma moeda com outro número. E a **cara é uma cancela erguida** — é o que
ela faz. **A marca da casa fica com o take**, que é o dinheiro de verdade;
o pedágio não se apropria dela.

⚠️ Medido, não olhado: com 4 segmentos a ponta da cancela caía a **47.7 de
raio numa face de 50** — encostava no anel usinado. Três segmentos e o
grupo descido 5k centram a massa.

⚠️ **O chip do topo NUNCA é somado ao take**, e **some quando é zero**. É a
mesma regra das duas linhas da carteira: total único faria a pessoa achar
que dá para sacar o brinde.

#### ⚠️ `fd-` já era da FUNDAÇÃO DE GUILDA — a armadilha nº 1 me mordeu

Criei `#fd-foto` para o anexo do feed. **`fd-foto` já existia: é o brasão
da guilda.** `getElementById` devolve o primeiro do DOM, então o handler do
feed ficou ligado no input do brasão e o input de verdade nasceu morto.

**E a minha sonda PASSOU** — o Playwright também casa com o primeiro
elemento, então `setInputFiles("#fd-foto")` mexeu no input da guilda, o
handler disparou e o resultado pareceu certo. Quem pegou foi
`test/colisao.js`, contando id duplicado.

Conserto: **todos** os ids do feed viraram `fdp-` (feed publicar), não só o
que colidiu — o prefixo `fd-` inteiro é da fundação, e deixar os outros lá
era esperar a próxima colisão.

### A camada social fecha: seguir, publicações, Rodando e a conversa (20/ago · 9 a 12)

Leva de pedidos do Victor depois de testar o feed. Três construções e
**quatro defeitos meus**, que são a parte que vale registrar.

#### Seguir virou botão, e mora num lugar só

A estrela é ícone sem rótulo: quem chega não sabe que aquilo é seguir.
Agora o perfil tem **Seguir/Seguindo** com todas as letras e cada post do
feed tem o dele. Os três — estrela da busca, botão do perfil, botão do
feed — passam por `alternarSeguir(id)` e leem o **mesmo `FAV`**. Dois
estados para a mesma relação dessincronizam na primeira tela que esquecer
de repintar.

⚠️ **DEIXAR DE SEGUIR NÃO REDESENHA A LISTA DO FEED.** A aba "Seguindo"
filtra por `FAV`: redesenhar fazia o post **sumir debaixo do dedo** de quem
tocou em "Seguindo" para parar de seguir, e a lista inteira pulava. É o
mesmo defeito do compartilhar com outra roupa — mexer no que a pessoa está
lendo. O botão troca no lugar; a lista se refaz na próxima visita.

**Foto e nome abrem o perfil** (`data-fdperfil`). Num feed isso é reflexo;
ninguém procura um botão "ver perfil", toca na cara da pessoa.

#### O "Me chama" no próprio post

Victor: *"não tô conseguindo colocar o botão de me chama na hora de
publicar algo."* Ele publicava "preciso de gente" e não via nada, porque
`pt.autor!=="eu"` escondia o botão — ninguém se chama.

**Tecnicamente certo e péssimo de usar: quem publica precisa VER o que
publicou.** Agora aparece desligado, com o motivo escrito
(*"Quem abrir vê Me chama aqui"*), e continua botão de verdade nos posts
dos outros.

#### Publicações: atividade ≠ obra

Aba nova no perfil, **primeira a abrir**, grade tipo Instagram. Post sem
imagem vira quadro de texto em vez de buraco.

| | Portfólio | Publicações | Feed |
|---|---|---|---|
| Trabalho que subiu | sim | não | só se compartilhar |
| Post próprio | só se marcar a caixa | sim | sim |
| **Repost de outro** | **nunca** | **nunca** | sim |

⚠️ **REPOST NÃO ENTRA NO PERFIL.** Peça de outra pessoa não é obra sua, e o
perfil é onde alguém decide te contratar: repost é conversa, currículo é
currículo. E a tela **diz a regra** em vez de a pessoa descobrir por
ausência.

⚠️ Mudar a aba padrão do perfil **quebrou quatro suítes** —
`acesso-a-agenda`, `perfil-canal`, `portfolio` e `contratante` liam
`#p-works`, `#p-reel` e `#p-clientes` sem navegar até o portfólio. Eu achei
uma por rodada de bateria em vez de varrer as quatro de uma vez, e isso
custou três baterias. **Ao mudar aba padrão, `grep` por quem lê os ids
daquele painel.**

#### Rodando — o que some em 24h

Victor pediu "bolinhas de stories" e depois: *"pode dar outro nome pra não
ficar igual ao Instagram. Pode ser timeline."*

⚠️ **TIMELINE NÃO SERVE, e é a única objeção que fazia diferença: timeline
É O FEED.** Twitter, Facebook e LinkedIn chamam assim a lista cronológica
de posts — que é exatamente o que fica logo abaixo das bolinhas. A mesma
tela teria duas coisas com o mesmo nome, que é o defeito do "Início que
abria Praças" outra vez.

**RODANDO** vem do que a casa já fala: *"tô rodando hoje"* é gravar, e
rodando é o carro andando. Diz o que o conteúdo é (o agora) e por que ele
expira (acabou o dia).

- Foto 5s, **vídeo até 30s — e o limite é LIDO DO ARQUIVO** antes de
  aceitar. Vídeo mais longo é recusado com o motivo, **nunca cortado em
  silêncio**: cortar o vídeo de alguém sem avisar é decidir por ela qual
  pedaço importa.
- ⚠️ **O sumiço é DERIVADO da hora, não agendado.** `rdVivo` compara com
  24h atrás e pronto — nada apaga nada. É o que faz o protótipo expirar
  sem servidor nenhum.
- A **minha bolinha é sempre a primeira, com o `+`**, mesmo sem story: é a
  porta de publicar, e escondê-la deixaria a fileira sem entrada.

#### Compartilhar passou a perguntar (20/ago · 11)

*"Quando apertar compartilhar, abre uma caixa pra confirmar e opção de
colocar algum texto."*

E resolve mais do que parece: **compartilhar era a única ação do feed que
publicava em nome da pessoa com um toque só, sem confirmação e sem
desfazer.** Curtir desfaz no segundo toque; comentar ela escreve antes de
enviar. Só o repost saía direto — e ainda ia para o topo, longe de onde ela
estava.

#### Curtir, fixar e responder comentário (20/ago · 11 e 12)

⚠️ **FIXAR É DO DONO DO POST, e só um por vez.** Fixar é escolher o que
fica no topo da conversa embaixo do SEU trabalho — quem passou por ali não
decide isso. E dois "destaques" não destacam nada.

⚠️ **A ÁRVORE DE RESPOSTAS DESCE UM NÍVEL SÓ**, como no Instagram.
Responder a uma resposta responde à **mesma raiz**, com o `@` dizendo a
quem: escada de neto não cabe em 390px, e a conversa deixa de ser legível
justamente onde ela acontece. `raizDe(pt,c)` é a régua.

**As respostas nascem recolhidas** (*"Ver 3 respostas"*): um comentário com
oito respostas empurraria os outros para fora da tela. E **fixar não existe
em resposta** — tiraria ela do contexto, e o topo mostraria metade de uma
conversa.

⚠️ **Comentário passou a precisar de ID PRÓPRIO.** Índice no array não
serve depois que fixar reordena a lista: o índice passaria a apontar para
outro comentário no clique seguinte.

#### Os quatro defeitos meus desta leva

1. **`fd-foto` já era o brasão da guilda.** Criei um segundo com o mesmo id
   para o anexo do feed; `getElementById` devolve o primeiro do DOM, então o
   handler do feed ficou ligado no input do brasão e o input de verdade
   nasceu morto. **E a minha sonda PASSOU** — o Playwright também casa com o
   primeiro elemento. Quem pegou foi `test/colisao.js`.
2. **As abas do feed usavam `.pt`**, que é a aba do PERFIL: `drawPtabs()`
   varre `.pt` e reescrevia o `aria-current` de todas — abrir um perfil
   apagava o destaque delas. Viraram `.fdpt`.
3. **Renomeando stories para `rd-`, `stcab` colidiu com `.rdcab`**, o
   cabeçalho do trilho que eu tinha acabado de criar. Virou `.rdvcab`.
4. **`.resp` já era classe raiz** — o rótulo verde de "responde em X min" no
   perfil. Meu modificador de resposta virou `.fdr`.

⚠️ **E o pior deles, porque falhou em silêncio:
`box.querySelector("button")`.** Isso pegava o botão "Enviar" da caixa de
comentários e funcionava enquanto ele fosse o único botão ali. Com curtir e
fixar em cada comentário, **o primeiro botão passou a ser a CURTIDA** — e
`bt.onclick=enviar` sobrescrevia o handler dela. Sintoma: fixar funcionava,
curtir não, e nenhum erro no console. **O mesmo defeito estava no teste**,
que clicava curtir achando que enviava — duas falhas de uma origem só.

**Seletor de ação aponta para a ação** (`.fdcombar button`), nunca para "o
primeiro que aparecer". Seletor posicional quebra em silêncio quando o
container ganha filho.

### Rede e convite: servir o job que a plataforma não intermediou (20/ago · 3)

Victor foi chamado para um freela por um amigo de mercado e perguntou:
*"o que faria esse contratante falar: certo, vou deixar as informações lá
na plataforma e te convidar pro job lá, pagar o seu sinal também?"*

**A resposta honesta é NADA — e a pergunta está invertida.** Pedir a um
amigo que crie conta e adiante 20% é pedir favor com risco social para
resolver um problema que ele não tem: ele confia nele. Vender garantia a
quem não sente risco é o pitch mais fraco que existe.

Então a direção inverte: **quem convida é o FREELA**, que é quem tem
interesse. E o que ele manda não é convite de plataforma — é ele sendo
mais organizado que os outros. *"Fechou, te mandei aqui os dados pra nota,
confere se o horário tá certo."*

⚠️ **A PLATAFORMA NÃO PRECISA GANHAR A CONTRATAÇÃO — ELA PRECISA GANHAR O
JOB DEPOIS DA CONTRATAÇÃO.** O "topa dia 12?" pode ficar no WhatsApp para
sempre. A escada é: (1) ele confirma um link, sem conta, de graça;
(2) depois de 4 ou 5 vezes ele tem os jobs num lugar só e cria conta porque
ELE quer a OD e a lista de equipe para o cliente dele; (3) quando precisar
de quem não conhece, aí existe risco e aí o sinal faz sentido — e ele pede
sozinho. Cobrar o degrau 3 no degrau 1 é o erro.

#### O sinal nasce DESLIGADO

É a decisão de produto inteira, e tem asserção com dois `⟶⟶` em
`test/rede-e-convite.js` para gritar se alguém "otimizar" isso. **O sinal
serve contra o desconhecido; entre gente que já trabalha junta ele é uma
desconfiança que ninguém pediu.** A caixa explica para que serve em vez de
só cobrar, e quem quiser liga — o padrão é escolha, não limitação.

E **quem recebe não precisa de conta.** Tela de cadastro antes de a pessoa
ver o que foi combinado mata o convite ali. A tela do convidado abre com a
**identidade visual de quem mandou**, não com a marca da plataforma: é o
que separa isso de spam.

#### O buraco do Carona, que era pior do que parecia

Victor: *"o plano carona, como o contratante consegue chamar quem ele já
conhece se ele n tem acesso ao perfil das pessoas?"*

O perfil e o "chamar" já eram livres. O defeito era outro e mais feio: a
estrela guardava a pessoa no **Meu time**, e `#e-time` mora **dentro** do
container `.escalar`, que `drawEquipe` esconde inteiro quando
`!podeVerAgenda()`. **No Carona você seguia alguém e a pessoa sumia** — e o
plano PROMETIA, com estas palavras, *"chamar quem você já conhece pelo
nome"*. A promessa não tinha onde morar.

Conserto: `#e-seguindo`, um bloco **fora de `.escalar`**, com a lista de
quem se segue e dois botões por linha — falar e chamar, os dois de graça.

| De graça, em qualquer plano | Do Volante |
|---|---|
| Seguir, ver quem você segue | **Saber quem está livre na data** |
| Mensagem direta | Montar a escala inteira |
| Chamar pelo nome | Passar o carro |

A linha do pago virou uma só, e é a certa: **seguir e falar é o que a
pessoa já faz de graça no WhatsApp; saber quem está livre é a única coisa
aqui que o WhatsApp não faz.**

⚠️ **Uma linha por pessoa** — e é aqui que esta lista se separa do Meu time
logo acima. Lá a repetição é certa (você preenche uma VAGA, e quem faz som
e câmera tem de aparecer nas duas listas). Aqui você procura uma PESSOA:
agrupando como o Meu time, seguir 3 pessoas rendia **16 linhas**.

⚠️ **NÃO EXISTE CONTADOR DE SEGUIDORES, E NÃO EXISTE FEED.** Os 109
cadastros são gente real: estampar *"fulano tem 340 seguidores"* seria
inventar número sobre pessoa de verdade, e um feed exigiria inventar
atividade dela — a regra #3 da casa nos dois casos. A tela mostra só o que
EU fiz: quem eu sigo. Ninguém é medido por isso.

O fio de mensagem direta abre uma **exceção declarada** à lei do chat (*"um
fio por negociação, e não uma caixa de mensagens solta"*): aqui o contexto
não é um job, é a PESSOA. Justifica-se porque sem ela o Carona não consegue
nem dizer oi para quem já conhece.

#### A OD: eu errei, o código não

No pitch eu escrevi que o freela mandaria a OD pronta para o contratante.
**Errado.** Victor: *"a OD é só um documento de organização que o
contratante vai fornecer aos freelas e ao cliente dele."* O código já
estava certo desde sempre — `"Quem edita é quem contrata — a ordem do dia é
documento dela. O freela ABRE e copia"`. Fica registrado porque o erro foi
meu texto de venda inventando um fluxo que o produto não tem.

### Pedágio — a submoeda de brinde (20/ago · 1)

Ideia do Victor: *"uma sub moeda do take, pra que eu possa dar de brinde
impedindo que seja sacada. O take pode sacar, mas a submoeda só pode ser
usada na plataforma para os planos de serviço e taxas de plataforma, não
pra equipamentos, não pra sacar."*

⚠️ **A REGRA "NÃO SERVE PARA EQUIPAMENTO" NÃO É PREFERÊNCIA DE PRODUTO — É
O QUE MANTÉM A COISA FORA DA RÉGUA DO BACEN.** No brechó, no aluguel e no
sinal, o dinheiro é de **outro usuário**. Um crédito emitido pela
plataforma que pagasse aquilo seria a plataforma **transferindo valor entre
pessoas com moeda própria**, que é exatamente a linha da instituição de
pagamento — a mesma que o take navega com custódia em subconta do parceiro.

Pagando só a receita da **própria** plataforma, o pedágio nunca vira
direito sobre dinheiro: é **desconto pré-concedido**. Não pede custódia,
não pede subconta, e contabilmente é receita diferida em vez de passivo com
terceiro. **Por isso `PED_PAGA` é lista fechada** — coisa nova só entra
depois de responder: *esse dinheiro é nosso ou é de outro usuário?*

#### O nome

Saiu da própria tela. A de planos já dizia: *"a conta de R$ 89 é **pedágio
de acesso**"*. E "vale-pedágio" existe no Brasil significando exatamente
isto: crédito que só paga a passagem.

Victor fechou o nome com uma frase melhor que a minha: ***"pode ser
pedágio, é o que paga pra avançar na estrada."*** Ela virou a primeira
linha da carteira — e cobrou uma correção de escopo, abaixo.

Descartados por colisão, e as duas valem registro:
- **Ficha** era o melhor candidato natural (ficha de fliperama: compra, usa
  na máquina, não troca de volta) — mas `ficha` tem **83 usos** como *ficha
  de conservação* do equipamento.
- **Crédito** está **proibido pela própria tela**: o produto promete, em
  dois lugares, que o take *"não vira crédito promocional"*. Usar o nome
  faria a plataforma se contradizer na mesma página.

#### As regras

| | |
|---|---|
| Paga | plano, taxa da plataforma, fundação de guilda (`PED_PAGA`) |
| Nunca paga | equipamento, sinal, saque (`PED_NAO`, cada um com o motivo escrito) |
| Abate | **antes do take** — senão o brinde apodrece enquanto o dinheiro sai |
| Vence | **por LOTE**, não por política global |
| Gasta | o lote que **vence antes** primeiro; o sem prazo por último |
| Carteira | **duas linhas, nunca somadas** |

**O vencimento é por lote de propósito.** Campanha de lançamento quer
prazo; bônus de indicação não precisa. Um saldo único obrigaria a escolher
uma política para sempre — `LOTES_PED` deixa a decisão por campanha.

**Duas linhas, nunca somadas**: um total único faria a pessoa achar que dá
para sacar o brinde, e descobrir que não na hora do saque é o tipo de
surpresa que gera raiva. O saque nem mostra o pedágio como bloqueado — ele
**avisa que existe e não entra**, com o motivo.

#### `pagamento(prefixo,total,saldoDisp,aoMudar,pedMax)`

`pedMax` é **quanto deste total o pedágio pode cobrir**, e o número mora em
cada chamada de propósito — quem lê a linha vê a regra:

| Chamada | pedMax | Por quê |
|---|---|---|
| `pfr`, `as`, `pm` (planos) | o preço | receita da plataforma |
| `cp` (brechó) | 0 | dinheiro de outro freela |
| `fe` (fechar escala) | **`taxa`** | a taxa é nossa, o sinal é cachê de gente |

**O caso `fe` é o que sustenta a regra inteira**, e tem teste: com
`P$ 5.000` na conta e um job de R$ 507 (390 de sinal + 117 de taxa), o
pedágio abate **117 e só 117**. Os 390 continuam saindo em dinheiro.

⚠️ **O botão "Simular um brinde chegando" é DEMONSTRAÇÃO**, no padrão de
`#inv-sim` e `#pp-sim`: existe porque o protótipo tem uma conta só e
ninguém veria o brinde chegar de outro jeito. **No produto quem concede é a
campanha, nunca o usuário.**

⚠️ Armadilha visual: o ícone do método ligado herdava
`.mtd[aria-pressed=true] i{background:var(--ciano)}` e virava um quadrado
**ciano sólido dentro de um cartão âmbar** — dois acentos brigando, com o
ciano significando outra coisa. A regra do acento não abre exceção nem para
moeda nova.

#### O domínio ENTROU NO AR (21/ago · 2)

**`https://carrodofreela.com.br` está servindo o protótipo.** Confirmado
pelo Victor — deste ambiente não dá para verificar (403 no CONNECT).

O que a tela da Vercel ensinou e o guia não sabia: **o IP não é o
`76.76.21.21` que circula na internet, é `216.198.79.1`.** A própria tela
avisa que eles estão expandindo a faixa e que o antigo continua valendo. O
guia dizia "use o que ela mostrar" — foi o que salvou.

⚠️ **O `www` deu erro, e a causa é de PRODUTO, não de DNS.** No painel da
GoDaddy o `CNAME www → carrodofreela.com.br.` já existia e resolve certo:
segue o registro A e chega na Vercel. **O que faltava era o www estar
cadastrado no projeto da Vercel** — sem isso ela recebe a requisição e não
sabe qual projeto atender. **Apex e www são dois cadastros separados lá**, e
o conserto é só na Vercel, sem tocar na GoDaddy. Virou linha própria na
tabela de defeitos do guia.

⚠️ **Não mandei ele mexer no `CNAME www` que já estava certo.** A versão
anterior do passo 13 mandava trocar o valor para `cname.vercel-dns.com` —
mudança desnecessária num registro que já funcionava. Passo virou
"confira, provavelmente não precisa mexer".

Os documentos passaram a apontar para o domínio próprio: `socio-tecnico` (o
link em destaque) e `dossie-edital` (a linha de anexos), com os PDFs
refeitos. **O `.vercel.app` continua funcionando** — a Vercel mantém os dois.

⚠️ **Sujeira que eu tinha deixado nos três documentos novos:** copiei os
tokens do PRD com `sed -n '7,62p'` e vieram junto um `*{box-sizing}`, um
`body`, um `.wrap` e o comentário órfão da `.capa`. As regras de baixo
venciam (medido: 390px, folga certa), então **nada quebrou** — mas `--col`,
`--pad` e `.larga` ficavam definidos sem efeito, e um dia alguém mexeria
neles achando que valem. Removido dos três, com as contagens de caracteres
reconferidas depois.

#### O www entrou, e a caixa de adicionar tem uma pegadinha (21/ago · 4)

`www.carrodofreela.com.br` no ar, ligado ao Production. **Os dois endereços
abrem o site**; o redirecionamento do www para o curto ficou como refinamento
opcional, pelo `Edit` da linha, com 308.

⚠️ **A caixa "Add Domains" tem DOIS campos com a mesma lupa e funções
opostas** — o de cima é *o que você adiciona*, o de baixo à direita é *o
destino do redirecionamento*. Eles se confundem, e trocá-los dá
*"já está atribuído a este projeto"*, que não explica nada.

⚠️ **"Redirect apex domains to www (recommended)" nasce MARCADA e faz o
contrário do que esta casa quer.** O endereço curto é o principal: é o que
o Victor fala em voz alta e é o que está impresso nos PDFs do sócio técnico
e do dossiê. Marcá-la transformaria o endereço dos documentos numa parada de
passagem.

⚠️ **O redirecionamento recusou o destino na hora de criar** (`Select a
redirect destination`, com o domínio visível no campo — combobox que exige
escolher da lista, e mesmo escolhendo não habilitou). **Contornado com
`Connect to an environment → Production`**, que resolve o que importa: o www
deixou de dar erro. Com `noindex` ligado, endereço duplicado não custa nada
— canonicalização só passa a importar quando houver busca orgânica.

#### Onde fica o Domains da Vercel — três chutes meus, todos errados (21/ago · 3)

Custou quatro idas e voltas com o Victor e vale registrar, porque o erro foi
de método: **eu escrevi o caminho de memória e não disse que era memória.**
Não dá para conferir daqui (403 no CONNECT), então cada palpite virou uma
volta perdida para ele.

Chutes que falharam: `Settings → Domains` (a Vercel tirou de lá — o menu de
Settings dele não tem o item), a URL `/carrodofreela-app/domains` (404) e
"a faixa horizontal de abas do projeto" (não existe nessa versão).

**O caminho real, lido do print dele:**
1. Seletor no topo, ao lado do nome da conta: troca de **All Projects** para
   **carrodofreela-app** — a barra da esquerda muda inteira.
2. **Domains** é item da BARRA LATERAL, logo abaixo de Environment Variables.
3. O botão de ligar domínio ao projeto chama-se **Add Existing** (não "Add").

⚠️ **Existem dois "Domains" idênticos, e a diferença é só o topo da tela:**
"All Projects" = conta (mostra "Third Party" sob o domínio, não serve);
nome do projeto = projeto (lista o `.vercel.app` junto). **O sinal de
reconhecimento vale mais que o caminho** — caminho muda com o redesenho da
Vercel, "a lista mostra os dois domínios" não muda.

**A lição que fica: quando o passo depende de uma interface de terceiro que
eu não posso abrir, peça o print ANTES de escrever o passo.** Um print teria
economizado quatro rodadas.

#### O guia de ligar o domínio (21/ago · 1)

Victor comprou `carrodofreela.com.br` na GoDaddy e pediu passo a passo —
*"tá difícil achar assim"*. Virou `docs/ligar-dominio.html`: **18 passos
com alvo de toque de 119px, progresso guardado em `localStorage` e barra
fixa dizendo qual é o próximo.** Ele faz isso de iPhone, alternando entre
três aplicativos — texto no chat rolava para longe.

⚠️ **A DECISÃO QUE VEIO JUNTO: o domínio recebe o build ANÔNIMO.**
`vercel.json` tem `buildCommand:false`, então a Vercel serve
`public/index.html` como ele foi subido — e o do repositório é o de nome
completo (o nome inteiro da pessoa, e não a forma reduzida). Enquanto o endereço era um `.vercel.app`
obscuro isso passava; um domínio de marca vai na folha do sócio, no dossiê
e na boca das pessoas. É a regra #4 da casa, e o domínio a torna mais
importante, não menos. O `noindex` fica — protótipo com dado simulado
indexado no Google é pior que link obscuro.

⚠️ **Gerei o anon SEM destruir o repositório**: `build:anon` escreve por
cima de `public/index.html`, então é backup → build → copia pro scratchpad
→ restaura. O repositório continua com o build completo.

⚠️ **`padding:10px 0 9px` na `.prog` ZEROU A FOLGA LATERAL da `.wrap`** —
atalho e classe de mesma especificidade, a última vence. O texto encostou
no vidro dos dois lados e "GITHUB" saiu cortado. **É a MESMA armadilha que
a `.capa` do PRD já documentava com estas palavras** (*"padding-top/bottom,
NUNCA o atalho"*) e eu caí nela no arquivo vizinho. Medido: `quantos` em
`left:0` e `agora` em `right:390` numa tela de 390. Depois: 18 e 372.

⚠️ **A sonda mentiu na primeira rodada** porque leu o arquivo cru: os
`docs/*.html` começam no `<title>` e **não têm `<meta viewport>`** — quem
põe é o embrulho do artifact. Sem ele o Chromium usa 980px virtuais e o
`.passo` mediu 567px numa tela de 390. **Para medir layout de celular
nestes documentos, embrulhe primeiro** (`_dom-wrap.html` no scratchpad faz
isso, igual ao `gerar-pdf.js`).

⚠️ Botão de copiar nasceu com 32px de altura, dentro de um botão maior:
errar o alvo marcaria o passo sem querer. Foi para **44px** com
`min-height` + `inline-flex`.

⚠️ **Não consegui conferir o que está no ar** — a política de rede deste
ambiente devolve 403 no CONNECT para hosts externos. Quem confirma o
deploy é o Victor; está dito na conversa e no próprio guia.

### O gerador de PDF virou geral (20/ago · 19)

`docs/gerar-prd-pdf.js` virou **`docs/gerar-pdf.js`**, com uma tabela de
documentos: `node docs/gerar-pdf.js` faz os três, `node docs/gerar-pdf.js
socio` faz um. ⚠️ **A margem do `p.pdf()` tem que bater com o `@page` de
cada folha** — divergindo, o texto sai numa caixa e o número de página
noutra. Por isso a margem mora na tabela junto do nome do arquivo.

Ele **conta as folhas** lendo o `/Count` do nó `/Type /Pages` do PDF, e foi
essa contagem que pegou o defeito: **a folha do sócio técnico saía em TRÊS
páginas**, com a terceira levando duas linhas — e o documento inteiro se
vende como *uma folha*. A impressão foi apertada de 9.4pt para **8.6pt**
com os espaços reduzidos, e caiu para **1.74 folhas de conteúdo**: duas
páginas com folga, frente e verso, sem órfã. ⚠️ **Mexeu no texto dele,
rode `node docs/gerar-pdf.js socio` e confira a contagem.**

O contexto do PDF usa `colorScheme:'light'` e `reducedMotion:'reduce'` —
o segundo porque senão a moeda do PRD é capturada de quina no meio do giro
e o carro no meio da chegada.

### Dois documentos novos: sócio técnico e edital (20/ago · 18)

Victor perguntou o que pedir no IMD, e a resposta virou dois documentos —
`docs/socio-tecnico.html` e `docs/dossie-edital.html`. Ambos vestem a
identidade da família (tokens do PRD, `#mk`, Schibsted + Spline Mono).

- **`socio-tecnico.html`** é UMA FOLHA (cabe em A4 impresso, `@page` A4 com
  14mm). O argumento não é mercado — é *"você não vai passar seis meses
  adivinhando o que eu quis dizer"*. ⚠️ **Declara com todas as letras que
  o Victor não é desenvolvedor e que o protótipo foi construído com IA**:
  um dev descobre em dez minutos, e vindo dele a confiança sobrevive.
  A faixa de equity (25–35%, vesting 4 anos / cliff 1 ano) é sugestão que
  ele precisa confirmar antes de enviar.
  ⏸️ **PARADO A PEDIDO DELE (24/ago): "esquece o sócio técnico por
  enquanto".** O documento fica onde está, pronto — não apagar, não
  reescrever. E **parar de listar a faixa de equity como pendência**: a
  decisão é dele e o assunto volta quando ele trouxer, não quando eu
  lembrar. Cobrar confirmação de coisa que o dono pausou é ruído.
- **`dossie-edital.html`** responde os 12 campos que Centelha, Inova
  Metrópole, Sebrae e FAPERN repetem. ⚠️ **Cada bloco `.resp` traz a
  CONTAGEM DE CARACTERES**, porque campo de edital tem limite.

⚠️ **AS DEZ CONTAGENS QUE EU ESTIMEI NO OLHO ESTAVAM TODAS ERRADAS** — de
78 vs 92 até 1.298 vs 1.020. Uma contagem errada num documento cujo
propósito é caber no campo é pior que nenhuma. `scratchpad/conta.cjs` lê o
`.resp` no navegador (juntando parágrafos com `\n\n`, que é o que ele vai
colar) e compara com o declarado. **Mexeu no texto de um `.resp`, roda a
sonda de novo.**

Decisões de conteúdo que seguem as regras da casa:
- **TRL 3 declarado, não 4**, com o argumento dos dois lados escrito — não
  há sistema funcional nem usuário. Editais punem TRL inflado.
- **Todo número de receita é marcado como cenário**, com as premissas
  visíveis, e as premissas é que são o convite à discussão.
- **A falta de perfil técnico está DECLARADA** numa caixa de alerta, com o
  plano de suprir. Omitir seria pior — é ponto de avaliação.
- O "59 → 12 mensagens" é declarado como derivado do desenho, não medido.
- **Nenhum dado pessoal de terceiros** aparece nos dois documentos.

### O PRD virou 2.0 (20/ago · 16)

Victor: *"Agora refaz o PRD + MVP + O Roadmap faseado. Com base em tudo que
já conversamos."* — a trava *"não movimente nada do PRD até eu pedir"* foi
levantada por ele mesmo. `docs/prd.html` é a v2.0, publicada no mesmo
artifact de sempre (`d8e69495-…`).

O que a v2.0 acrescenta sobre a v1.0, e as decisões editoriais:

- **Duas seções novas**: *A rede — a porta de entrada* (04) e *Como o
  contratante entra — o convite de job* (05). O documento passou de 12 para
  14 seções.
- **A régua do corte do MVP mudou e o texto diz isso**: era *"o que o
  primeiro job precisa para fechar"*; virou **dois ciclos** — o do dinheiro
  e o do dia. A camada social entra no MVP como porta de entrada e alavanca
  da métrica-mãe (quem abre todo dia mantém a agenda); **o Rodando sai** de
  propósito, para ser a Fase 2 — é o anúncio mais visível e barato do
  calendário, e gastá-lo no lançamento desperdiçaria uma campanha pronta.
- **O pedágio entrou no MVP** como instrumento de campanha: é cupom, não
  moeda — não depende do parceiro de pagamento, e o lançamento é quando o
  brinde mais serve. O regulatório ganhou a nota de que ele fica FORA da
  conversa com o parceiro.
- **Roadmap foi de 5 para 6 fases** (Rodando vira Fase 2; o resto desliza).
- **"Zerar os cadastros no lançamento" mudou o enquadramento dos 109**:
  lista de convocação, não contas pré-criadas — e a LGPD melhora junto, o
  consentimento de publicação passa a ser o próprio cadastro.
- **Riscos novos**: o feed como classificado que esvazia o Volante (com as
  quatro regras escritas ANTES de o canal existir: derivado da agenda, um
  por semana, expira sozinho, nunca filtrável), o feed vazio no lançamento,
  e a rede de nomes reais em praça pequena (denúncia é MVP e é a única peça
  social ainda não desenhada).
- **Métricas novas**: *Dia sem job* (a porta) e *Convite → conta* (o funil
  invertido). Total de 8.
- **"O que o produto não é" ganhou duas linhas**: sem algoritmo de
  engajamento (o top 10 com outra roupa) e sem engajamento fabricado.
- `docs/gerar-prd-pdf.js` agora lê `docs/prd.html` do repositório (lia um
  caminho morto de scratchpad de outra sessão) e o rodapé do PDF diz v2.0.

#### O PRD vestiu a identidade (20/ago · 17)

Victor: *"Deixe o PRD bonito visualmente com a identidade visual da
empresa, carrinho, moedas e etc."* A regra do trabalho: **importar do
produto, nunca redesenhar** — documento com uma marca "parecida" é pior
que documento sem marca.

- **O selo da capa e a assinatura do rodapé usam o `#mk`** (as três barras
  inclinadas), copiado do protótipo para um `<defs>` no topo do arquivo.
- **O carrinho é o SVG da pista, verbatim**, com os tokens do app
  mapeados por aliases locais em `.rodovia` (`--ciano:var(--accent)` etc.).
  Ele chega dirigindo (1.5s, rodas girando 8 voltas de .18s) e **estaciona
  sobre o próprio fio da capa**: margem negativa igual ao padding-bottom da
  capa, para não inventar uma segunda linha de asfalto. A impressão tem
  padding diferente, então ganha o seu `-20px` próprio no bloco print.
- **As moedas são a `fabricarMoeda` portada inteira**, com `LIGA_TAKE` e
  `LIGA_PEDAGIO` exatas. Uma diferença só: `claro` sai de
  `data-theme`/`prefers-color-scheme` (o tema do documento), não da classe
  `app-light` do app. Medido: 31% dos pixels pintados no claro, 49% no
  escuro (o brilho do anodizado só existe no escuro, como no app).
- **Papel é papel**: em `beforeprint` a moeda `pousa()` no ângulo de
  repouso (-0.62 rad, mostrando a CARA — três barras no take, cancela no
  pedágio) e força liga clara; `gerar-prd-pdf.js` agora emula
  `reducedMotion:'reduce'`, senão o PDF capturava a moeda de quina no meio
  do giro e o carro no meio da chegada (a animação do carro também é
  `@media screen`, pela mesma razão).
- **Tokens novos `--ciano-esc` e `--segurando`** entraram nos DOIS blocos
  escuros, no claro E no bloco de impressão — token que só existe num tema
  é o defeito clássico do artifact ilegível.
- Movimento reduzido: carro já estacionado, moeda estática na cara, e a
  repintura de tema vira evento (`MutationObserver` em `data-theme` +
  `change` do media query), porque sem laço de animação ninguém repinta.

⚠️ **O PRD continua NÃO prometendo o que o Victor não decidiu**: o canal de
disponibilidade no feed não existe e aparece só como risco com regras
preventivas; o Premium fino segue como decisão em aberto.

### O pedágio na estrada (20/ago · 2)

A frase do Victor apontou um buraco que eu tinha deixado: **se o pedágio é
o que paga para avançar na estrada, ele tem que aparecer NA ESTRADA** — e
não só na carteira e no caixa. Eu tinha construído a moeda inteira sem
nunca mostrá-la no lugar onde a pessoa decide subir de degrau.

`#pn-prox` (o próximo posto, na tela de planos) agora diz, **derivado de
`pedagio()` e `VIA_PRECO[p]`, nunca guardado**:

- cobre em parte → *"Você tem **P$ 10** de pedágio — cobre R$ 10 deste
  degrau, faltam R$ 9."*
- cobre inteiro → *"**dá para este posto inteiro.**"*
- **sem pedágio → a linha não existe.** Saldo zero não se anuncia; um
  *"você tem P$ 0"* é a plataforma cutucando para comprar.

Os três casos têm asserção em `test/pedagio.js` (37 no total). O estilo
`.viapdg` fica na família âmbar de `--segurando`, o mesmo acento da moeda
em todo lugar — a estrada não ganha uma cor nova por causa disso.

### O zoom do iPhone em todo campo (19/ago · 23)

Victor: *"Quando abre o botão de suporte, tá dando zoom na tela, tira esse
zoom."*

**O Safari do iOS amplia a página inteira sempre que o campo que recebe o
foco tem fonte MENOR que 16px** — e não desfaz quando o foco sai. A pessoa
fica com a tela grande e tem que pinçar de volta.

O suporte era só o mais visível, porque é **o único que põe o foco sozinho
ao abrir** (`v("fbk-msg").focus()`). O defeito era de **todo campo do
aplicativo**: `.fld` nasceu com 13.5px. Medido no build anterior: **172
campos** abaixo de 16px. Tocar em qualquer um dava zoom.

Dois consertos:

1. **`@media(max-width:820px),(pointer:coarse)` põe 16px em todo campo.**
   `pointer:coarse` pega o iPad em paisagem, que passa dos 820px e zooma
   igual.
2. **O painel de suporte não põe mais o foco sozinho no celular.** Abrir e
   já subir o teclado por cima da tela inteira é agressivo mesmo sem zoom —
   quem abre quer ler antes de escrever. No computador o foco continua,
   porque lá não abre teclado nenhum.

⚠️ **O conserto NÃO é `maximum-scale=1` no viewport.** Isso mata o pinçar
para ampliar — acessibilidade — para resolver um sintoma.

⚠️ **E O LUGAR DA REGRA IMPORTA.** Posta antes do bloco do suporte,
`#fbk-panel textarea` (1,0,1) **empatava em especificidade e vencia por vir
depois** — justamente o campo do defeito relatado continuava com 14px, e a
contagem caía de 172 para 8 parecendo resolvida. A regra é a **última da
folha** de propósito. É a armadilha nº 10 desta lista com outra roupa.

**A lista de seletores veio de varrer a FOLHA, não o DOM** — campo que mora
em modal que o teste não abriu conta igual. São sete regras que põem fonte
menor que 16 num campo: `.fld`, `.inl`, `.oqf .fld`, `.odl .fld`,
`.edf select`, `.eqadd input`, `.chatbar input`, `#fbk-panel textarea` e
`#fbk-panel input[type="text"]`. **Regra nova com fonte menor entra ali.**
A suíte `feedback` faz a mesma varredura e reprova.

### O documento SAI da plataforma (19/ago · 22)

Victor: *"Não queria só poder copiar o texto da OD, ou do boletim, ou do
roteiro; quero que ele consiga baixar um documento em tabela já pronto. Ele
preenche na plataforma e faz o download já pronto com a ID visual do
usuário."*

Copiar texto resolvia o WhatsApp e mais nada. Ordem do dia, boletim,
proposta e roteiro são papéis que **circulam** — vão para o cliente, para o
e-mail da corretora, para a ilha, para o grupo do job. Nesses lugares um
bloco de texto colado é amador e, pior, **perde a tabela, que nestes papéis
É a informação**.

Duas saídas, nenhuma pedindo biblioteca:

| Botão | O que é |
|---|---|
| **Baixar em Word** | HTML com MIME do Word, extensão `.doc`. Word, Google Docs, Pages e LibreOffice abrem e **mantêm a tabela**. É o formato que já circula em produtora no Brasil. |
| **Imprimir / salvar em PDF** | a caixa de imprimir do navegador — no iPhone, Compartilhar → Salvar em PDF. PDF sem biblioteca nenhuma. |

⚠️ **A FOLHA REUSA O HTML QUE A TELA JÁ MONTA.** Os documentos são escritos
com `var(--cal)`, `var(--linha)` e companhia. Em vez de reescrever cada um
para o papel, `FOLHA_CSS` **redeclara os mesmos tokens em valores claros** —
o tema claro da casa. O documento sai idêntico ao da tela, em papel, e
qualquer documento novo ganha o mesmo tratamento de graça. Há teste
conferindo que `--cal:#1B1815` está lá e que nenhum token escuro vazou:
sem isso, texto branco em papel branco.

O timbre é o **mesmo** dos quatro papéis (`timbreFolha`, sobre o
`ORC_TIMBRE` que já existia): logo, nome, rodapé e a cor da marca. Ele
nasceu no orçamento e cresceu para ser a identidade de tudo que sai daqui.
⚠️ Orçamento e proposta **já trazem o timbre dentro do próprio HTML**, então
passam `semTimbre:true` — senão sairiam com dois. Há teste contando um só.

**O roteiro também sai.** A plataforma já entende a tabela do roteiro para
ler funções e dias; entendendo, ela sabe **remontá-la**. Sobe um `.docx` de
qualquer jeito e desce um roteiro em tabela, timbrado — a primeira linha
vira cabeçalho, que é como toda tabela de roteiro se escreve. O botão só
aparece quando há tabela: para texto corrido, "roteiro em tabela" com uma
coluna só seria promessa vazia.

⚠️ **Separar pelo PIPE, não por `" | "`.** `limparXML` colapsa espaço
repetido, então a coluna vazia chega como `" | | "` e não `" |  | "` — o
split pela string de três caracteres devolvia uma célula a menos e a barra
aparecia dentro do texto da coluna seguinte.

⚠️ **Download é bloqueado dentro de iframe**, que é como a aba de aprovação
do Claude mostra a página. Na Vercel não existe. `emIframe()` detecta, e o
botão **avisa** em vez de não fazer nada e parecer quebrado — mesma postura
do relatório de custo, mas agora com a função construída de verdade.

### A faixa de cima, bem distribuída (19/ago · 22)

*"Organize a diagramação da aba superior onde tem as páginas, pra ficar bem
distribuído da forma como grandes sites fazem."*

O `margin-right:auto` estava na **marca**. Ela empurrava tudo — abas
inclusive — para a direita: a navegação terminava espremida contra a
carteira, o menu e o nome, e sobrava um vazio no meio-esquerda da barra.

Grande site nenhum faz isso. Em Stripe, Linear, GitHub e Vercel **a
navegação pertence à marca, não às ações**: logo à esquerda, páginas logo
depois dele, ações empurradas para a ponta direita. O `auto` mudou de lugar
— saiu da marca, entrou no bloco `.acoes` — e a folga passou a ficar
**entre a navegação e as ações**, que é onde ela respira. Com o espaço
recuperado, `gap` foi de 2 para 4 e a folga lateral da aba de 8 para 11:
dez rótulos a 2px de distância pareciam uma palavra só.

### A proposta e a conta são dois papéis (19/ago · 21)

Victor mandou **o orçamento timbrado que ele de fato manda ao cliente** e
ele derruba o que a tela gerava.

A proposta real mostra a equipe como **cabeça**:

```
2. Equipe
   1x Produtor
   2x Cinegrafista
   1x Operador de drone FPV
   1x Editor

Valor: R$ 4.500,00
```

Nenhuma diária aparece. **Um** valor fecha.

O que a tela gerava era a **planilha**: cada função com a diária, a
quantidade, os dias e a fonte do número. Isso é o documento interno — e
mandá-lo ao cliente faz duas coisas ruins de uma vez: convida negociação
linha a linha (*"por que o gaffer custa isso?"*) e **põe o cachê de cada
freela no e-mail do cliente**, que não é assunto dele e é constrangedor
para quem trabalha.

Agora a mesma conta gera **dois papéis**, num seletor: **A proposta —
para o cliente** (abre nela) e **A conta — só sua**. O valor é o mesmo; o
que muda é o que se mostra. O botão de copiar copia **o papel à vista** —
copiar a planilha achando que copiou a proposta é exatamente o erro que
manda a diária do gaffer para fora.

A proposta segue o modelo dele: Atendimento · Cliente · Peça · Onde ·
escopo em prosa · **1. Entrega** · **2. Equipe** (por cabeça) · **3. Forma
de pagamento** (`ORC_PAGTO`) · Valor · OBSERVAÇÕES IMPORTANTES
(`ORC_OBS_PADRAO`: nota fiscal, escopo fechado, validade condicionada à
entrada) · praça e data por extenso.

O teste que sustenta a tela: pega as diárias de `calcOrc()` e verifica que
**nenhuma** aparece no texto da proposta.

### Roteiro publicitário é TABELA (19/ago · 21)

Os três roteiros reais que ele mandou são tabela, com colunas diferentes
conforme a peça:

| Peça | Colunas |
|---|---|
| Comercial de TV (Agaé) | `FALA \| LETTERING \| CENA` |
| Animação para redes (Dicas Eleição) | `Tela \| Voz \| Lettering \| Sugestões` |
| Institucional de Instagram (SERHS) | `CENA \| ANIMAÇÕES \| LOCUÇÃO` |

Extraindo só o texto corrido, as células colavam umas nas outras: uma
parede de palavras, ilegível para quem lê e pior para o leitor de
palavras, que perdia a fronteira entre uma cena e a seguinte. `tabelasDoc`
transforma cada `<w:tr>` numa linha com as células separadas por `" | "`.

Célula vazia **continua contando como coluna** — filtrando as vazias, a
linha *"fala | (sem lettering) | cena"* virava *"fala | cena"* e
desalinhava da linha de cima.

#### O bug que só um .docx de Word real revelava

`textoDocx` lia o **cabeçalho local** do ZIP. O Word grava com o **bit 3
de flag** ligado: nesse modo o cabeçalho local traz **tamanho zero** e os
tamanhos reais vão num *data descriptor* depois dos dados. Lendo zero, o
código varria até o próximo `PK` e entregava ao inflate o fluxo **mais os
16 bytes do descriptor** — o `DecompressionStream` recusa tudo, e um
roteiro de Word caía como *"não consegui tirar o texto"*.

O `.docx` que o próprio teste fabricava passava, **porque não usava o bit
3**. Fixture caseira validando o caminho feliz do jeito errado.

Agora lê o **diretório central**, que é onde os tamanhos são sempre
verdadeiros, usando o cabeçalho local só para achar onde os dados começam
(e lendo dali os *próprios* comprimentos de nome e extra — copiar os do
diretório central erra o offset). O fixture do teste passou a ser o
roteiro de Word real.

### Ordem do dia é CRONOGRAMA, não briefing (19/ago · 20)

Victor: *"Ordem do dia não é isso. Ordem do dia, mais conhecida como OD, é
um cronograma em tabela de tudo que vai acontecer no dia"* — e mandou a OD
real de um episódio do **Muído Potiguar**.

Ele está certo, e o erro era de natureza, não de grau. O que estava aqui
era um **briefing**: quem é quem, onde, chamada, o que levar. Isso é a
metade de baixo de uma OD. A de cima é a **TABELA**.

A OD real tem: cabeçalho HORÁRIOS (chegada / filmando / fim do set),
refeições, previsão do tempo, lista de locações com endereço, **a tabela
`CENA | LUZ | LOC/SET | SINOPSE | HORA`**, a tabela de convidados
(`Convidado | Contato | Chega | Local`) e a motivação do dia.

**O que faz a OD ser OD: os horários se encadeiam.** O fim de um bloco é o
começo do próximo, do café da manhã à desprodução. É por isso que mexer
numa preparação de 20 minutos obriga o produtor a refazer trinta linhas na
planilha.

Aqui ele digita **duração**; a hora é derivada (`cronoOD`). Mesma lei do
resto da casa: o que dá para calcular não se guarda. E o cabeçalho HORÁRIOS
é derivado da tabela — *"Filmando"* é a primeira linha de **cena**, não a
chegada da equipe; *"Fim do set"* é onde a cadeia termina; as **locações**
saem das colunas LOC/SET e dos destinos de deslocamento. Ninguém digita
duas vezes.

Tipos de bloco (`OD_TIPOS`), do vocabulário da OD real: **cena**,
**preparação** (o 🔺), **deslocamento**, **refeição** e bloco livre. Os
dois últimos têm `rotuloProprio`: na OD de papel a linha é
*"CAFÉ DA MANHÃ - Pães Dourados"*, não *"REFEIÇÃO — Café da manhã"* — o
que a produção escreve já é o nome do bloco.

**Previsão do tempo é campo, não mágica.** Toda OD traz, e dava para
fingir: chutar 28° para Natal em agosto acerta quase sempre. Mas é por
essa linha que a equipe decide se leva capa de chuva. Consultar serviço de
tempo é chamada de rede e esta página não faz nenhuma — então é campo, com
a promessa dita de que o backend preenche depois.

#### A armadilha: `min-width:0` na modal

A tabela tem `min-width:520px` (coluna de 30px não se lê em set). A `.ovl`
é **grid**, e item de grid tem `min-width:auto` — ele se recusa a ficar
menor que o conteúdo. Aquele 520 subiu pela árvore inteira e a modal ficou
com **606px de largura dentro de uma tela de 390**, com os botões de mover
bloco fora do alcance do dedo.

`.mdl{min-width:0}` resolve para todas as modais de uma vez: o item
encolhe e quem rola é a tabela, dentro do próprio quadro, que é onde a
rolagem devia estar.

### A faixa de cima e o botão que cobria o Menu (19/ago · 19)

Dois pedidos do Victor no mesmo dia.

#### `--barra-baixo` nunca existiu

*"O botão de suporte tá ficando na frente do botão de menu, atrapalhando
ali a aperta menu, isso no mobile."*

```css
@media(max-width:820px){ #fbk-btn{bottom:calc(var(--barra-baixo,64px) + 12px)} }
```

**A variável nunca foi definida em lugar nenhum** — nem ali, nem em
`#avisos`, que se apoiava na mesma. Valia sempre o fallback de 64px, e o
palpite funcionava enquanto a barra media 59.

No iPhone ela não mede 59. `.bottombar` tem
`padding-bottom:calc(6px + env(safe-area-inset-bottom))`, e a faixa do
indicador de casa põe ~34px: a barra passa de **90px**. O botão, parado
nos 76px do palpite, cai **dentro** dela — no canto direito, que é
exatamente onde fica o Menu.

O emulador não reproduz: sem notch, `env()` é zero e o palpite acerta. Por
isso o teste injeta `#bottombar{padding-bottom:40px}` à mão — é o único
jeito de a suíte enxergar o defeito. Verificado: reprova no build
anterior, passa neste.

Agora `medirBarraBaixo()` publica a altura **medida**, e roda no arranque,
no `resize`, nos eventos de `visualViewport` e dentro do `show()` — porque
a barra some na homepage e o suporte tem de descer junto. **O fallback
virou 0**: sem medida, o botão fica no canto de baixo como em qualquer
site. Errar para baixo é discreto; errar para cima cobre um botão.

#### A faixa de abas do desktop

*"Agora organiza as páginas na aba de cima, que é no desktop."* Ela tinha
ficado sem revisão enquanto a barra de baixo (·15) e o menu (·17) eram
arrumados, e desencontrou dos dois. Três defeitos:

- **"Montar equipe" era a SEGUNDA aba do freela** — uma tela paga e
  trancada na frente das propostas e da agenda dele. Vender antes de
  servir.
- **"Meus jobs" não existia na faixa**, embora esteja na barra do celular
  e no menu. É onde o dia acontece (lista de equipamento, ordem do dia,
  boletim) e o desktop não tinha porta.
- **"Meu perfil" no meio da operação** — o mesmo erro que o menu já tinha
  corrigido.

Ficou, nos dois lados, na mesma ordem da barra de baixo e do menu:

```
freela:      Início · Propostas · Agenda · Equipe · Jobs · Orçamento · Guilda · Brechó · Perfil · Aprender
contratante: Início · Propostas · Equipe · Passar o carro · Jobs · Orçamento · Guildas · Brechó · Perfil · Aprender
```

**Os rótulos passaram a ser os mesmos nos três lugares**: Equipe, Agenda,
Perfil, Jobs — como a barra do celular já chamava. Nome diferente para a
mesma tela em duas telas do mesmo aplicativo é o usuário aprendendo duas
vezes. O nome por extenso ficou no `title`, para quem passa o mouse.

Isso e 8px de folga lateral em vez de 10 (com dez abas, 40px) fizeram a
faixa **caber** a 1440 nos dois lados, e a 1280 no lado do freela — antes
ela cortava "Aprender" no meio da palavra nos dois. A 1100 ainda rola,
com o degradê de `.tabs.rola` avisando.

Armadilha: `medirAbas()` só era chamado no `show()`, mas quem troca o
conjunto de abas visíveis é `aplicarModo()`. Trocar de chapéu deixava o
degradê com a resposta do outro lado da conta — agora ele remede ali
também.

### Texto preto dentro de todo textarea (19/ago · 18)

Victor: *"O texto do espaço que coloca o roteiro no orçamento por roteiro
fica da cor preta no modo escuro."* Estava, e **não era do orçamento**.

```css
button,input,select{font:inherit;color:inherit}   /* faltava textarea */
```

Sem herdar, o navegador pinta o conteúdo de um campo com a cor de sistema
— preta. No escuro isso é **preto sobre grafite, razão 1.2**: praticamente
invisível. Eram **10 campos**, não um: `mp-sobre`, `u-desc`, `oc-rot`,
`cd-w-d`, `m-desc`, `tb-desc`, `nv-desc`, `iv-obs`, `pl-obs`, `ocr-desc`.
Só o do suporte escapava, porque `#fbk-panel textarea` declara `color`
na regra dele — foi o que escondeu o defeito todo esse tempo.

A correção é uma palavra. **O que importa é por que ninguém tropeçou:**

- A auditoria de `test/contraste.js` só olha elemento com **nó de texto
  próprio**. O que a pessoa digita não é nó de texto, é `.value`, e campo
  vazio não tem texto nenhum. **Todo controle de formulário era invisível
  para a varredura.**
- E `contraste.js` **era um relatório, não um teste**: despejava JSON e
  saía com zero achasse o que achasse. Uma razão de 1.2 passava no verde.

As duas coisas foram consertadas junto com a CSS:

1. Varredura nova (`CAMPOS`) sobre todo `input`/`textarea`/`select`,
   comparando a cor declarada com o fundo — funciona em tela escondida,
   porque a cor vem do CSS e não de estar à vista.
2. A suíte agora **reprova**: qualquer campo abaixo de 4.5 (sem caso
   tolerado — é onde a pessoa lê o que ela mesma escreveu), e qualquer
   achado de texto que não esteja em `CONHECIDOS` ou que tenha piorado.

`CONHECIDOS` é **dívida declarada, não perdão**: 8 casos de texto
secundário sobre fundo tingido, entre 3.39 e 4.41 — `.selo.s-ocupado`,
`.sb3` e o `<s>` do preço riscado sobre o tinto âmbar, e o `<small>` do
dia da semana sobre o tinto verde da agenda. Ficam pinados para não se
multiplicarem enquanto não forem resolvidos.

### O menu depois da barra de baixo (19/ago · 17)

Victor: *"Organiza também a parte do menu que abre, pq acho que uma das
coisas é meu perfil ficar lá em cima perto de Início."*

**O menu mudou de função quando a barra de baixo chegou** e ninguém tinha
reorganizado ele por causa disso. Era a única porta para tudo; hoje sete
telas estão a um toque na barra, e a gaveta virou **o mapa + o que sobra**.
Continuava com a hierarquia de quando era a porta única.

O que estava errado:

- **"Começo" e "Sua conta" tinham UM item cada** — Início e Planos. Dois
  títulos para dois botões é cabeçalho fazendo volume.
- **"Meu perfil" estava enterrado** no meio de "Operação", quinto de sete,
  entre Meus jobs e Guilda. É a tela mais pessoal do produto no meio da
  lista de trabalho.
- **"Mensagens" morava em "A plataforma"**, ao lado de *Perguntas
  frequentes* e *O que é o Carro do Freela*. Caixa de entrada não é
  documentação — ninguém procura a própria conversa no FAQ.
- **"Preferências" (tema e som) vinha DEPOIS** de dois grupos de leitura,
  um deles inteiro desabilitado. No celular eram ~1000px de rolagem para
  desligar o som no meio de uma gravação.

Ficou:

| Grupo | O que tem |
|---|---|
| **Você** | Início · Meu perfil · Planos · Mensagens |
| **O trabalho** (era "Operação") | Propostas · Agenda/Montar equipe · Passar o carro · Meus jobs · Orçamento · Guilda · Aprender |
| **Equipamento** | Brechó · Inventário · Alugar · Vendas |
| **Preferências** | Tema · Som |
| **Dentro do fluxo** | as 5 telas que abrem por uma peça, desabilitadas |
| **A plataforma** | os 5 textos de documentação |

**A ordem dos grupos é a ordem do uso**: o que se aperta antes do que se lê
uma vez na vida.

Armadilha: o botão de Mensagens era markup estático com `onclick` ligado
**uma vez** no `initGaveta`. Passando para dentro de `#g-voce`, que é
repintado a cada abertura, o handler morria na primeira repintura — agora
ele é ligado dentro de `pintarGaveta`, junto com os outros. E
`pintarBadgeMsg()` desceu para depois da linha que cria o botão, senão
pintava um badge que ainda não existia.

### A barra de baixo é a tela de campo (19/ago · 15)

*"Organiza melhor os menus mais usuais pra ficar na aba de baixo do
mobile."* — Victor

| | antes | agora |
|---|---|---|
| freela | Início · Propostas · Agenda · Guilda · Orçamento · Brechó · Menu | Início · Propostas · Agenda · **Jobs** · Guilda · Brechó · Menu |
| contratante | Início · Propostas · Guilda · Orçamento · Brechó · Menu | Início · Propostas · **Equipe** · **Jobs** · Guilda · Brechó · Menu |

- **Orçamento saiu**: é ferramenta de escritório, com formulário grande —
  quem orça está sentado. Continua nas abas do topo e no mapa de telas.
- **Meus jobs entrou**, e era a pendência que eu mesmo tinha levantado: o
  painel do job virou o lugar do dia inteiro (lista de equipamento, ordem do
  dia, boletim de câmera) e estava a **três toques** no celular.
- **Montar equipe entrou do lado de quem contrata**: é o que ele abre
  primeiro.
- **Guilda desceu na ordem** — é social, vem depois do que a pessoa abre
  para trabalhar. Continua na barra, com o ponto de não-lido do salão.

Sete itens cabem: 55px cada a 390px, 50px a 360px, sem overflow.

**Kits (19/ago · 11).** *"Às vezes ele leva os mesmos equipamentos para um
trabalho específico: gravação de DVD, chamado pra ser operador de câmera —
provavelmente vai levar os mesmos equipamentos nesse tipo de serviço e
função."* — Victor

O kit é chaveado por **TIPO DE TRABALHO + FUNÇÃO**, os dois catálogos que
já existem (`TIPOS` e `FUNCOES`), e não por nome livre. É o par que a
pessoa reconhece — e é o que deixa a plataforma **sugerir sozinha**: o job
já sabe `e.tipo`, e a escala já sabe a função dela. `kitSugerido(e)` marca
o certo com ★ e a tela diz por quê: *"Neste job você é Op. de câmera num
trabalho de Clipe."*

⚠️ **APLICAR UM KIT NÃO MARCA NADA COMO CONFERIDO.** Foi o Victor quem
cravou, e é a metade do pedido que importa: *"não é só ter lá o grupo de
equipamentos predefinidos, ele precisa conferir que tudo que tá ali ele
está levando pro job."* **Kit que chega marcado é lista que ninguém olha**
— vira o papel que todo mundo assina sem ler. O kit poupa a DIGITAÇÃO,
nunca a CONFERÊNCIA. Por isso também **não existe "marcar todos"**, nem na
saída nem na volta: seria a mesma porta pelos fundos.

Isso obrigou o placar a ter **três estados, na ordem do dia**:
`por conferir` (saída) → `por voltar` → `tudo voltou`. Enquanto houver peça
sem conferir na saída é isso que ele cobra, e uma linha explica que as
peças vieram de um kit e nenhuma vem marcada.

O editor (`ovl31`) serve aos três caminhos — guardar a lista atual, criar
do zero e editar — porque três telas para a mesma coisa é como nascem três
comportamentos diferentes. Os kits moram no **inventário**, que é de onde
as peças saem.

⚠️ **Todo `.ovl` tem `z-index:60`, então quem ganha é quem vem depois no
HTML.** O editor de kit abre POR CIMA da lista (que fica aberta atrás de
propósito — quem guarda um kit está no meio de montar a lista), mas seu
markup vem antes: sem `#ovl31{z-index:62}` a lista engole os cliques e o
editor parece travado. **Modal que abre sobre outro modal precisa dizer
que está por cima.**

⚠️ **O ganho de encanamento é o que o Victor viu, e é maior que a função:
o inventário deixa de ser cadastro e vira hábito.** Preencher uma vez passa
a servir para levar, conferir na volta, alugar, vender, transferir e
instruir seguro. E a lista é **o melhor funil que o inventário tem** — item
avulso digitado ali (cabo, bateria, cartão) vira peça do inventário com um
toque, e aí já nasce dentro de todo o resto. Quem monta lista de job monta
toda semana; quem "cadastra equipamento" não faz nunca.

### Aba de planos, dentro do menu (18/ago)

Pedido do Victor, e o segundo recado dele decidiu o lugar: *"essa aba de
planos fica dentro do menu"*. `v-planos`, entrada no grupo **Sua conta** do
mapa.

- Mostra os três planos do lado em que a pessoa está e deixa **ver o outro
  lado sem trocar de conta** (`pnLado`) — quem é freela e pensa em contratar
  precisa ver o preço antes de virar a chave.
- **Reusa `.planos/.plano/.pv/.pq/.lista` da homepage**: mesma linguagem,
  zero CSS novo, zero risco de colisão.
- **`PLANO_FREELA`** passa a existir: Premium e Estrada eram só vitrine, sem
  estado. Compra por `abrirPlanoFreela()` (`ovl27`, mesmo `pagamento()` do
  resto). O lado de quem contrata continua no `abrirAssinatura()` que já
  havia — não se duplica fluxo de cobrança.
- **Um acento por tela**: "Seu plano" é `.selo-eu`, neutro; o ciano do
  `.selo-pop` fica com o recomendado. Dois selos cianos seriam dois acentos.
- **A regra dura está escrita na tela** (`.limite`): nenhum plano compra
  posição na busca, selo, prioridade ou destaque. Há teste para essa frase —
  se ela sumir da tela, sumiu do produto, e a suíte acusa.

### O menu virou mapa de telas (18/ago)

Victor: *"o botão de menu para ver todas as páginas é comum demais"*, com a
referência do menu que ele usa no Maestro. **O que se trouxe foi a
hierarquia, não o visual** — o amarelo de lá é o nosso ciano e ele marca só
onde a pessoa está.

- Folha centrada (`.gaveta` continua sendo o id e o `.on`, mas deixou de ser
  gaveta lateral), título **Todas as telas**, contagem e lado da conta.
- **Grupos por natureza**: Começo, Operação, Equipamento, Dentro do fluxo,
  A plataforma, Preferências, e as ações de conta no rodapé. Achar pelo que
  se quer fazer, não lendo tudo de cima a baixo.
- **`AQUI`** marca a tela aberta — e é o **único acento do mapa inteiro**,
  com teste contando quantos itens vêm em ciano.
- **"Dentro do fluxo"** é o grupo que faltava: perfil de alguém, anúncio,
  salão, painel do job, busca por data. Existem, aparecem no mapa e são
  `disabled` com a nota *"telas que abrem a partir de uma peça, não pelo
  menu"* — mostrar o tamanho do produto sem prometer porta que não há.
- Sub-telas do brechó entram por `data-irbp` (abre a view e o painel).
- Com o mapa aberto, `body.mapa-on` esconde o botão de suporte: ele é o
  único elemento acima do véu.

### Softskill: declarada no cadastro, lida no perfil (18/ago)

Já existia em Meu perfil; o Victor apontou que faltava **onde a pessoa
preenche**: no cadastro, **logo depois das funções**. É ali que ela acabou
de dizer o que faz e lembra do que a função não conta.

- **Um dado (`EU.soft`), dois lugares** (`#cd-soft` e `#pf-soft`), **um
  desenho só** (`drawSoft()` pinta os dois). Dois desenhos separados
  dessincronizariam na primeira mudança.
- No cadastro as sugestões são **chip de um toque** (`data-softpoe`,
  `SOFT_SUG`): no celular, digitar oito vezes é o que faz pular o campo.
  Em Meu perfil segue o input com datalist, que já existia.
- Teto `SOFT_MAX=8` nos dois; passando disso as sugestões **somem** em vez
  de fingir que cabem.
- **Ninguém real é semeado com softskill** — só o dono declara a sua, e há
  teste conferindo que `CREW` não traz nenhuma. Mesma regra da diária, do
  defeito de equipamento e do gênero.
- No perfil público sai em `#p-soft`, chips ao lado do nome: é a razão de
  o campo existir — duas pessoas com a mesma função e a mesma diária, isto
  é o que desempata.

### Suporte nos testes (18/ago) — `fbk`

Canal de sugestão/problema/elogio para os primeiros testadores, visível
desde a homepage. Peças: `#fbk-btn`, `#fbk-panel` (reusa `.segm` para o
tipo), `FBK_KEY`/`fbkPost()`/`cdf-fbk-fila`.

- **Fixo no canto de baixo à direita**, que é onde todo site põe. Nasceu
  arrastável (a ideia era desviar do que estivesse embaixo) e o **Victor
  mandou prender**: botão que muda de lugar não tem lugar, e o ganho de
  desviar de um obstáculo eventual não paga o custo de procurar toda vez.
  No celular sobe pela mesma medida dos avisos (`--barra-baixo`), para os
  dois não brigarem pelo mesmo canto.

- **Envio pelo Web3Forms** (e-mail `carrodofreela@gmail.com`). A access
  key é pública por desenho — o destino está amarrado a ela no servidor.
  `FBK_KEY=""` = modo local: o recado cai na fila e a tela DIZ que não
  enviou. Sem key nada finge que foi.
- Contexto vai junto (tela `S.tab`, chapéu `MODO`, janela, navegador) e o
  painel mostra o que vai — nada sobe escondido.
- Arrastar ≠ clicar: limiar de 7px; arraste não abre o painel.
- No celular o botão nasce acima da `#bottombar`; painel vira folha de
  baixo. z-index 96/97 (acima dos avisos 95, abaixo só do grão).
- O visualizador de artifact bloqueia o fetch → cai na fila local com a
  mensagem honesta; na Vercel funciona. 32 suítes (`feedback`).

### Landing de pré-cadastro (17/ago) — `landing/`

Etapa 1 do plano de lançamento, pronta para a Vercel (Root Directory
`landing/`, sem build). `corpo.html` é a fonte; `node landing/gerar.js` injeta
as fontes da casa e escreve `index.html`, que é o que se commita e sobe.

- **Duas trilhas** (freela / contratante) com campos diferentes — contratante
  responde tipo de negócio e jobs/mês, que é o que qualifica quem paga.
- **LGPD é o motivo jurídico da página**: aceite de contato obrigatório para
  todos; para freela, um segundo aceite de PUBLICAÇÃO (nome, funções e cidade
  na plataforma). É esse aceite que autoriza usar os 109 cadastros do grupo.
- **Dias livres dos próximos 15** no passo seguinte, opcional — é o que faz a
  plataforma abrir com agenda viva. Datas geradas na hora, nunca fixas.
- **Envio via Supabase REST**, bloco `CONFIG` no topo do script. SQL da tabela
  e política *insert-only para anon* no `landing/README.md` — a anon key não
  lê nem apaga, por isso pode ficar no HTML. **Sem CONFIG a página roda em
  modo demonstração e AVISA** — nunca finge que gravou. Falha de rede cai em
  `localStorage` (`cdf-leads-fila`) em vez de sumir em silêncio.
- Honeypot contra bot; máscara de telefone; wa.me de compartilhamento com
  mensagem diferente por trilha.
- **O carro passa quando o cadastro fecha.** Física e som portados do
  protótipo sem alteração (`atravessa` linear em `translate`, solavanco em
  `transform`, motor com Doppler + buzina sintetizados no Web Audio). É a
  assinatura da casa fechando o pré-cadastro — a pessoa entra na leva e vê o
  carro passar. `COM_SOM` no topo do script desliga o áudio numa linha; o
  contexto de áudio só nasce dentro do clique, que é o gesto que o navegador
  exige. `prefers-reduced-motion` corta os dois.
- ⚠️ **A pista fica no rodapé (`bottom:0`), não no meio.** Primeira tentativa
  pôs em `14vh` e o carro atravessou por cima do "Você está na primeira leva"
  — passou por cima justamente do que a pessoa acabou de conquistar. No
  celular ele ainda encolhe (`max-width:600px`: 132px, pista de 70px).
- **`passo()` rola até o cartão, não até o topo** (exceto na primeira tela,
  onde o cabeçalho É o argumento). No celular o cabeçalho empurrava o
  formulário para baixo da dobra.

⚠️ **HTML que sai daqui para um servidor precisa de `<head>` PRÓPRIO.**
`corpo.html` começa direto no `<title>` porque nasceu para virar artifact,
e o visualizador de artifact monta doctype/head/body por fora — inclusive a
`<meta name="viewport">`. O arquivo que foi para a Vercel não tinha esse por
fora, então **subiu sem viewport**: todo navegador de celular montou a página
num viewport virtual de **980px** e encolheu para caber. Resultado: layout de
computador, letra minúscula, margem enorme — e **nenhuma media query de
celular valendo**, porque para o navegador a tela tinha 980px.

Foi o que o Victor reclamou três vezes ("fica muito pequena as informações"),
e as duas primeiras rodadas de conserto tipográfico não podiam funcionar: elas
mexiam em regras que nunca chegavam a ser aplicadas.

**O Playwright não pega isso.** `viewport:{width:390}` define o viewport de
layout DIRETO — a meta não faz falta lá, e a suíte passa verde com o defeito
em produção. Para reproduzir é preciso `isMobile:true` no contexto. Medido:
sem a meta o site enxerga **980px** e `matchMedia("(max-width:600px)")` dá
`false`; com ela, 390px e `true`.

Hoje quem monta a página inteira é o `landing/gerar.js` (doctype, `lang`,
charset, viewport, theme-color, description e og: para o preview do
WhatsApp). **Qualquer HTML novo que for servido por conta própria tem que
passar pelo mesmo lugar.**

Consequência: **`landing/index.html` deixou de servir para publicar como
artifact** — ele agora é documento completo, e o visualizador embrulha o
arquivo num `<html><head>…<body>` próprio, o que aninharia dois documentos.
O artifact da landing (`0a231ebe-8b08-4d63-bbb9-f2bdf6f1ff4c`) está na
última versão boa; para atualizá-lo, publique a partir de um arquivo em
formato de artifact (o `corpo.html`, ou uma saída sem `<head>`), nunca do
`index.html` que vai para a Vercel.

⚠️ **`[hidden]` perde para `display:grid` do autor.** Os campos por trilha
usavam o atributo `hidden` em elementos com `display:grid` de classe — o UA
stylesheet perde e o campo continuava visível. `[hidden]{display:none!important}`
no reset resolve. Vale para qualquer HTML novo fora do template principal.

### PRD e o corte do MVP (19/ago · 23) — `docs/prd.html`

Pedido do Victor depois de o protótipo fechar: *"agora quero fazer o MVP e
o PRD do produto."*

O MVP virou **uma seção dentro do PRD**, não um documento à parte — o corte
de escopo é uma decisão sobre o produto, e separá-lo produziria duas
verdades que divergem na primeira mudança.

**A régua do corte:** ficou dentro só o que é necessário para **o primeiro
job fechar** — cadastro, agenda, busca, montar equipe, passar o carro,
propostas, sinal + contrato, entrega/conferência/liberação, cancelamento,
carteira e planos. Ficaram fora, em cinco fases de lançamento, as onze
peças que o protótipo já tem prontas: brechó, inventário/dossiê, aluguel,
guildas/coletivos, documentos de produção, perfil-canal e o take.

**Os números que são hipótese estão marcados como hipótese.** É a parte do
documento que mais importa para não virar mentira em pitch:

- 74% aceitam garantia / 26% exigem — **gerado por semente** (`rnd(c.id…)`)
  no protótipo. Ninguém foi perguntado.
- `REFERENCIA` (a faixa da praça) é **tabela escrita à mão**, não derivada
  dos 109 — ninguém declarou preço. No produto real ela tem de sair de
  tabelas publicadas e jobs fechados, senão a plataforma está inventando
  diária, que é a regra que ela mesma proíbe.
- Sinal de 20% e taxa de 6% são chute de mercado do Victor.
- Reputação de operação e assinatura gov.br são simuladas.

O documento **reusa a identidade do produto** (Schibsted Grotesk + Spline
Sans Mono pelo Google Fonts, a escada de cinza quente, ciano só em acento):
um PRD que parece o produto que descreve economiza a explicação de o que é
a marca.

**PDF**: `node docs/gerar-prd-pdf.js` monta o `<head>` que falta, espera as
fontes do Google carregarem (sem isso o PDF sai na fallback e ninguém
percebe), emula mídia de impressão e usa `page.pdf()` do Chromium —
15 páginas A4, com numeração no rodapé. As regras de `@media print`
**redeclaram os tokens em versão clara**: quem imprime pode estar com o
tema escuro ligado, e sem isso o PDF sairia com texto claro sobre papel
branco. É o mesmo princípio da folha dos documentos do produto.

⚠️ Duas armadilhas conhecidas morderam de novo ao escrever a página, e as
duas estão nesta lista há meses:
1. **`padding: X 0 Y` num elemento que também é `.wrap`** — a `.capa` era
   `class="wrap capa"` e o atalho zerou a folga lateral: o título encostava
   no vidro no celular. `padding-top`/`padding-bottom`, nunca o atalho.
2. **Sem `<meta viewport>` o Chromium infla o texto sozinho.** Aberto
   direto do disco com `isMobile:true`, o corpo de 16px computava **44px**
   e a página parecia quebrada. O publicador de artifact põe a meta, mas o
   arquivo em `docs/` não tem — para conferir, monte o `<head>` antes de
   medir. `html{text-size-adjust:100%}` ficou como defesa.

## Testes

Playwright + Chromium. O binário deste ambiente está em
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; em outro lugar, use
`CHROME=/caminho node test/run.js`. O Playwright costuma estar global
(`/opt/node22/lib/node_modules`) — o `run.js` repassa o `NODE_PATH` sozinho.

| Suíte | Cobre |
|---|---|
| `busca` | praças, filtros, favoritos, data global, perfil |
| `propostas` | aceitar, recusar com motivo, o job que nasce disso |
| `chamada` | passar o carro, a corrida, quem perdeu |
| `cadastro` | seis etapas, medidor, zerar e refazer |
| `contratante` | conta e perfil de quem contrata |
| `fechar-escala` | escala fechada vira job com valor em custódia |
| `pagamento` | Pix, cartão e saldo nos dois checkouts |
| `carteira` | take, saldo, saque, taxa na venda |
| `mensagens` | caixa e chat por negociação |
| `menu-e-chat` | gaveta, chat, quebra de linha da bolha |
| `brecho` | catálogo por categoria, oportunidades, impulsionado |
| `portfolio` | trabalhos, clientes, equipamento em chips |
| `take` | a moeda em 3D e a página que a explica |
| `acesso-a-agenda` | **o portão**: o que cada lado vê |
| `catalogo-de-tipos` | catálogo único, dado sujo normalizado |
| `som` | os oito sons sintetizados |
| `contraste` | 15+ telas × 2 temas, contraste e overflow — **e reprova**: campo de formulário ilegível, contraste de texto novo ou que piorou |
| `colisao` | colisão de classe e id duplicado |
| `explicador` | desde 04/out: toda tela de topo abre na LINHA CURTA (`data-lead`) com "Como funciona" — primeira visita inclusive —, nenhum parágrafo de topo sem ela, e cada linha curta numa linha só a 1280px |
| `cancelar-e-editar` | regras de cancelamento, sair do job, substituir/acrescentar gente |
| `pagamento-misto` | garantia opcional em "Fechar escala", quem entra em custódia e quem não |
| `filtros-busca` | busca por nome, filtro garantia/acerto direto |
| `meu-time` | painel de favoritos na tela de escalar |
| `sinal-e-contrato` | sinal de 20%, assinatura pelos dois lados, entrega por função |
| `premium-contratante` | os dois planos, cláusulas, relatório/CSV, escala recorrente |
| `carona-e-coletivos` | plano grátis, coletivos, e o filtro Apenas mulheres |
| `guildas` | brasão, time compartilhado, nível, e o limite de não mexer na busca |
| `guilda-social` | aba e ranking, chat interno, líder no set, à venda no perfil, os dois planos |
| `tempo-real` | avisos de "pegou a vaga" e "carro na sua porta", e a travessia sem freada |
| `inventario` | lista privada do que é seu, estimativa de conta aberta, anunciar/editar em um clique, transferência de posse, contrato de locação |
| `aluguel` | catálogo de aluguel, disponibilidade derivada, pedido que não reserva, os dois lados do empréstimo |
| `feedback` | botão de suporte: fixo no canto, fila local honesta, honeypot, acima da barra de abas |
| `softskill` | declarar no cadastro depois das funções, um dado em dois lugares, teto de 8, aparece no perfil |
| `mapa` | desde 17/out · 10 a GAVETA (Planos logo abaixo da conta com o tipo derivado da escada, e as seções Encontrar · Ferramentas · A praça nessa ordem): encostada à esquerda, sem título nem contagem de telas, a conta no topo como porta do Meu perfil (com trocar e sair), o dia no primeiro bloco e Praças abrindo o do trabalho, nenhum botão desabilitado (o "Dentro do fluxo" saiu), Ajuda e Ajustes recolhidos e lembrando como a pessoa deixou, tema e som à vista, uma tela só marcada com o azul de seleção, o Brechó como grupo que abre sozinho dentro dele, e muda com o lado da conta |
| `sem-zoom` | 17/out · 11: em 360/375/390/414/430, dos dois lados e com as duas moedas à vista, a janela fica do tamanho do aparelho em oito telas (com `isMobile`, que é o único jeito de o Playwright ver a página alargar), nada da barra é cortado pelo clip, a marca fica inteira — e o estresse de T$ com cinco dígitos e P$ com quatro a 360; de 481 a 600 a barra cabe inteira; o selo e a chave saem da barra até 560 e continuam no menu (a chave virou o segmentado da gaveta, que troca de lado e fecha) |
| `entrar` | 17/out · 13: só duas portas (Google e a conta oficial; Apple, WhatsApp e Microsoft não voltam), e-mail e senha com rótulo, 16px, validação que diz o que falta, o olho, "Esqueci a senha" sem fingir e-mail, a senha e o e-mail NUNCA no armazenamento, os campos esvaziando, a partida como cópia sem id nem toque que some sozinha; "Criar conta" como modo que leva ao perfil; a cena é o VÍDEO do carro (mudo, em loop, playsinline, Blob só quando a tela abre, o pôster como fundo e a saída de emergência quando o H.264 não toca), com a reserva desenhada montada, e o recorte mostrando o carro inteiro sem o cartão nem a frase em cima; parada com movimento reduzido (o vídeo nem nasce); cabe sem rolagem em cinco tamanhos, nos dois temas, sem o cartão cobrir o carro; a frase do nome no desktop; abre no escuro ; desde 18/out · 3 a ponte: medido pela caixa do vídeo (cena × `--k`, à direita), as torres da frente terminam antes do cartão em quatro janelas de computador, o carro não encosta na borda em nenhuma das sete, e a frase do desktop é só ela, sem rótulo em cima; desde 18/out · 5 o carro a pelo menos 10% da borda (a regra da ponte saiu) e o CARTÃO QUE ABRE PERTO: longe o vidro encolhe até a pílula com os campos transparentes mas no lugar e alcançáveis, perto ele abre inteiro sem o cartão mudar de lugar nem de tamanho, texto num campo o prende aberto, vazio e sem foco ele volta a encolher, o teclado abre, e no celular nasce aberto; desde 18/out · 6 o compacto fica MAIS EMBAIXO (centro entre 36% e 56% da altura) com o título e a pílula dentro do vidro, e abre SUBINDO: o vidro volta ao topo do cartão e o título anda colado nele; desde 18/out · 7 o olho da senha não sai do lugar no toque (`:active` forçado pelo CDP) |
| `menu-recolhivel` | 17/out · 10: a lateral do desktop recolhe num trilho de 72px (corpo recua junto, abas só ícone com title, pastilha casando, alça inteira apesar do vidro, sem cair em cima do selo Prévia) e CONTINUA recolhida depois de recarregar (http); a gaveta do desktop flutua à esquerda e some de verdade fechada; movimento reduzido não desliza; no celular o Menu fica NO CENTRO da barra (390 e 360, freela e contratante), três itens de cada lado, o círculo sobe acima da barra, e continua no centro quando um item some de um lado só; desde 17/out · 13 o círculo inteiro mora DENTRO da caixa do botão (o toque no alto e na beirada cai no Menu), é a marca com o carrinho no anel, gira e para com movimento reduzido, e a barra não cresce |
| `planos` | a aba de planos dentro do menu, assinar/cancelar dos dois lados, e a regra dura escrita na tela |
| `orcamento` | questionário → conta viva: faixa da praça, fonte nominal só de quem publicou, imposto por dentro, padrão salvo, vira escala, **roteiro subido como arquivo** (lido no aparelho; o que não dá para ler é dito) |
| `dossie` | dossiê da peça, prontidão que diz por quê, ocorrência que congela o estado de antes, e nada de série/nota/estrago inventado |
| `perfil-canal` | demoreel que NÃO finge tocar, playlists por tipo de trabalho, e o álbum como forma do MESMO trabalho — com o destaque aceitando reel ou álbum |
| `documentos` | ordem do dia derivada do job, chamada por pessoa, boletim de câmera puxando a série do dossiê, take que se numera sozinho |
| `pedagio` | a submoeda de brinde: nunca no brechó nem no saque, cobre a taxa e nem um centavo do sinal, vencimento por lote, e a carteira em duas linhas |
| `lista-equipamento` | o que saiu e o que voltou por job, a lista que é da PESSOA e não do lado da conta, avulso que vira inventário, o que não voltou virando ocorrência, e o kit que enche a lista SEM marcar nada |
| `sirene` | a chamada que toma a tela: mesma corrida e mesma caixa, decidir com calma não mata nada, expirar mata só a urgência, contagem derivada de `prop.ate` |
| `cofre` | painel financeiro sem conta própria: cada total refeito pelas primitivas, A pagar por pessoa, direto "por fora", metas e guardas da pessoa sobrevivendo ao reload, "nada de dinheiro aqui" escrito |
| `denuncia` | a peça que faltava: motivo obrigatório, o post some da SUA vista mas continua existindo, não se denuncia duas vezes nem o próprio, comentário também, e as regras nos termos — inclusive a de que crítica sem apontar pessoa FICA |
| `versoes` | um protótipo por fase: o build padrão intacto (`FASE=0` é no-op), fases cumulativas, a Fase 1 sem carteira/contrato/garantia, a porta de entrada existindo na fase, o gate sobrevivendo à troca de chapéu — e, desde 12/set, o **brechó da Fase 1**: o painel de vendas existe, a carteira e o extrato não, nenhuma linha cita taxa/custódia/impulsionado, e "Falar com o vendedor" abre a conversa e nunca o checkout |
| `identidade` | cada tela diz onde você está: desde 17/out · 14 pelo TÍTULO (nenhum se repete) e nenhum rótulo em caixa alta aparece em cima de título — medido na tela, uma por uma, também depois de trocar de chapéu; a cor da área pinta no cartão do topo (brilho da pastilha ou véu da foto) nos dois temas, e cor de área nunca em botão |
| `vitrines` | toda tranca é vitrine: o que faz + degrau pelo nome certo + preço + porta que abre a assinatura certa + mini-estrada apontando o degrau — e "Ver o Premium" nunca mais |
| `painel-do-job` | o mesmo `detJob` servindo os dois lados: rótulo, custo × diária, quem edita, briefing por campos, referência com o porquê, e `podeDocJob` mudando com o papel no dia |
| `movimento` | som chamado que não existe na paleta, `animation:` sem `@keyframes`, e `prefers-reduced-motion` valendo também nas duas animações que rodam por JavaScript |
| `porta-e-tabela` | a porta curta de duas etapas, a lista do que falta abrindo o cadastro inteiro (desde 18/out · 7 recolhida atrás de um toque, que abre), as duas colunas da tabela, drone fora de acessório, uma conta só, e o convite da tabela |
| `cadastro-foco` | 18/out · 7: cada pergunta é um cartão com os MESMOS campos (ids de sempre, uma vez só), uma em foco e as outras apagadas e desfocadas mas tocáveis; Enter e Próxima levam à seguinte e a última da etapa à etapa seguinte; tocar numa apagada ou escolher numa lista traz o foco; a estrada com um ponto por pergunta (7 na porta curta, ≥15 na longa), o carro andando 1/7 por resposta; a frase que só diz "aparece na busca" com perfil pronto; nenhum parágrafo longo à vista e a lista do que falta atrás de um toque; a última da porta curta leva ao "Concluir e entrar" sem apertá-lo; o stepper ainda navega; sem rolagem lateral em 390 e 360 |
| `duas-moedas` | take × pedágio lado a lado antes do saldo, cada afirmação derivada de `PED_PAGA`/`MOEDA`, o recolhimento na visita seguinte, e o aviso do brinde levando até lá |
| `porcentagens` | onde há caso concreto a porcentagem vem com o valor em real; onde não há, vem sozinha — e todo valor bate com a função que o calcula |
| `guia-portas` | o guia aparece uma vez, não prende, as quatro portas LEVAM, muda com o lado da conta, e os botões cabem num iPhone SE |
| `catalogo-autocompletar` | sugestão por pedaço de palavra, apelido e categoria; nenhuma categoria sem item; escolher preenche nome/categoria/referência — e nos campos de DECLARAR: só a categoria do campo, sem preço, chip direto, fragmento que preserva a linha, e o `input` disparado para o dado chegar ao perfil |
| `faixa-de-diaria` | o teto não pune campo em branco, a linha diz tabela × faixa da praça, e o rótulo mostra a função que fez a pessoa caber |
| `densidade` | "Meu perfil" em menos de três telas com resumo em cada cabeça, o brechó em duas colunas sem cortar preço, e a nota de REGRA recolhendo enquanto a de estado fica |
| `primeira-visita` | o aviso da primeira abertura, o que ele promete e o que a sessão realmente guarda |
| `persistencia` | o que sobrevive ao recarregar e o que é limpo de propósito — com a **canária** que separa defeito de produto de defeito de navegador; desde 19/out · 2 também o perfil da produtora, quem se segue (conferido por id, não por contagem), a curtida e os ajustes de Agenda e WhatsApp |
| `seguranca` | 19/out · 2: o `vercel.json` (redirecionamento de `/app/…`, `noindex`, nosniff, moldura proibida, Permissions-Policy, o cache da `m/`), o `.vercelignore` em lista de permitidos, a CSP calculada servida com a página (todas as telas, a folha de impressão, Web3Forms e Supabase alcançáveis, zero violação) e BLOQUEANDO script injetado, `onerror`, link `javascript:` e origem fora da lista; os filtros (`urlSegura`, `cssUrl`, `corOk`, `esc`, `celCSV`, `urlDoArquivo`) e conteúdo hostil em nome, cidade, post, comentário e anúncio sem virar código |
| `fase1-sem-dinheiro` | 19/out · 2: o texto VISÍVEL das telas da Fase 1, dos dois lados, sem garantia, sinal, custódia, taxa, pedágio nem saldo; a pergunta 5 do cadastro sobre identificação (no objeto E no cartão montado); pedágio zero na primeira entrada; o comparativo só com Carona e Volante e alinhado; a assinatura sem Frota e com Pix e cartão; os modais (consulta, convite, proposta aceita) sem sinal — e o build completo com tudo de volta |
| `registro` | o cadastro que sai do aparelho: silêncio em `file://`, fila local servido por http, desduplicação por aparelho |
| `rodando` | o mural de 24h: um item por pessoa, o que venceu some sozinho, e a ordem que não muda debaixo do dedo |
| `sem-nome-real` | o **selo** do `crew.json` (sha256 da lista fictícia aprovada) e a ausência de telefone — os dois conferidos SEMPRE, com ou sem cofre; e, se `crew.local.json` existir, a varredura completa do repositório contra a lista real volta sozinha. Desde 13/set não passa mais por ausência: a lista real foi aposentada e o selo tomou o lugar dela |
| `abertura` | o primeiro quadro: nenhuma seção nasce visível, o véu no markup cobrindo 390×844 até o boot acabar, a tela de login em nenhum quadro, a coreografia inteira antes da saída, e o véu removido do DOM; desde 17/out · 12 nada da saída cresce por `scale()` (serrilha no iPhone); desde 19/out a coreografia é de ~1s (piso de 1050 contado do começo da animação, saída abaixo dos 2950 antigos), a saída é o íris (buraco maior que o disco no meio dela, emblema já fora de cima da home, e o halo começando escondido atrás do disco) e a buzina cai aos 0,70s da animação |
| `abertura-solta` | 18/out · 3: nenhum erro prende a pessoa na abertura — estado salvo que quebra o redesenho abre na home e o erro fica anotado e vai junto no suporte; erro não tratado com o véu de pé solta o véu; arranque limpo não anota nada |
| `doca` | desde 04/out: no desktop a navegação é a BARRA LATERAL e a doca não aparece; no celular a barra de baixo cheia; uma nav só (nada de id duplicado), a pastilha casando com o item ativo NA TELA em quatro larguras — inclusive na do `zoom` do corpo (desde 18/out · 5 pelo retângulo, não por `offsetTop`) —, deslizando só depois da primeira colocação, e o feed do dia 1 sem banner mentiroso e com duas saídas |
| `anuncio-no-feed` | o brechó chegando ao feed: cartão DERIVADO e não fabricado (fora de `POSTS`, fora de `.fdpost`, sem curtida de brinde), vendido e reservado sumindo sozinhos, a hora saindo de `dias`, uma lista só ordenada pelo relógio, o cartão levando ao anúncio de verdade, e a aba Seguindo só trazendo quem se segue |
| `uso-real` | o lote de 29/ago: detalhe do job embaixo do card (um elemento movido, não copiado), o dono do job de fora editando os fatos, material do job com a honestidade dos documentos, OD em PDF como anexo + desfazer do Substituir, viaja a trabalho (declarado/chip/filtro), a janela do dia sem hora inventada, a caderneta de voo derivada dos jobs com o aviso do que ela NÃO é, e o paradrop — a carga com nome real que desce de paraquedas e só age no pouso |
| `descarga` | o controle do logger — a MESA: arrastar a pasta cria o cartão e adivinha o rolo pelos dois caminhos (nome do arquivo e nome da pasta, e nenhum cobre o outro), a mesma pasta duas vezes não duplica, a unidade é a CHEGADA, a conferência de destino marca só chegada COMPLETA, mesmo-nome-outro-tamanho entra como novo e grita (era aqui que a tela descartava um cartão inteiro dizendo "nada novo"), duas travas independentes, a pendência no painel do job — e a tela dizendo que não copia byte nenhum |
| `cartao-do-link` | as meta tags do cartão de link, e a descrição medida em navegador de verdade |
| `tela-de-inicio` | as tags do modo app (e que elas NÃO estão no artifact), o nome curto que cabe no iOS, os três ícones PNG do tamanho certo, opacos, com fundo grafite e a marca em ciano (desde 19/out no pé da barra cheia do disco do Menu), o manifest standalone com maskable, e o modo app mudando o layout só nele |
| `agenda-declarada` | a declaração do dia: livre é a ausência, meia diária fechada continua sendo dia livre, negociando sem job fabricado por trás, a hora que só existe se a pessoa disser, os dois eixos independentes — e **a declaração sobrevivendo ao recarregar**, que é o que o `BLOQ` nunca fez |
| `cara-de-empresa` | a revisão de 04/out: nenhum texto diz que os cadastros são reais, o Premium da home igual a `PLANO_DET`, nada de "Mais escolhido", "esperando você" um número só nos três lugares, as telas abrindo no conteúdo (e a primeira proposta na primeira tela do iPhone), a marca inteira a 360/375/390, um rosto único por perfil fictício completo — e nenhum na conta de demonstração nem nos incompletos — e a capa por função. Desde 17/out: o hero **sem** foto de fundo e sem os assets dela |
| `vagas` | a tela de 17/out · 9: porta na lateral dos dois lados e no menu do celular; diária de toda vaga = faixa da praça (`REFERENCIA`); função e tipo dos catálogos; quem publica as semeadas é fictício; filtro por tipo e "só da minha função"; interesse e salvos de graça e sobrevivendo ao reload (http); **publicar é do Volante** — no Carona a vitrine (degrau + R$ 89) e nenhuma vaga nasce; com o Volante a vaga é publicada com a diária dita antes, vai para "Suas vagas", e os interessados simulados são só quem tem a função e está livre, com aviso que se declara simulação |
| `busca-e-cartao` | a busca geral do brechó (sem caixa e sem acento, só anúncio ativo, o mesmo cartão do brechó, sem resultado com sugestão, "Limpar" devolvendo as categorias, o cartão abrindo o anúncio) e o cartão do job na agenda (cabeça com cliente, função e selo de situação; o cliente continua sendo o `.linkc`), em 1440 e 390 |
| `home-clara` | a home de 17/out: o olho e a manchete dizendo o que é, dois botões que abrem o login na aba do lado certo, a busca sem conta conferida contra `status()` (dia, filtro por função, contagem e o número do botão), "perfis fictícios" no cartão e nada de diária/telefone/@ nele; desde 17/out · 2 a régua da vitrine — menos de 700 palavras, nenhum parágrafo acima de 20, todo bloco com visual próprio, sem depoimento fictício; no celular (390 e 360) manchete + botões + começo da busca na 1ª tela, os sete dias cabendo, sem rolagem lateral, a página em menos de nove telas, e os planos em trilho; desde 17/out · 3 a C — ~~claro como padrão~~ (desde 17/out · 13 o ESCURO é o padrão e o claro segue opção, com o botão de tinta), botão de tinta, a arte 3D como única imagem do topo, a busca larga logo embaixo e ainda na 1ª tela do desktop, os objetos 3D carregando, a prova "N livres hoje" saindo de `status()`, a praça só com o que existe, e nada de estrela, "+mil", "mais escolhido" ou "verificados"; desde 18/out a CARONA, e desde 18/out · 3 UM vídeo só em ciclo (sem abertura separada, cada cena uma vez em `HOME_VIDEO.cenas`), nenhum `play()` antes de o véu da abertura sair, sem H.264 a cena descansa no quadro do banco do carona, e sair pausa; desde 18/out · 6 a cena tem o tamanho do topo inteiro e NENHUM contexto de empilhamento entre ela e o `.hero` (o que a recortava na caixa do texto no Safari), e desde 18/out · 7 continua assim depois de VOLTAR à home de dentro do app |

Ao mexer na navegação, as suítes quebram no seletor — é o comportamento
esperado, e a correção é atualizar o teste, não afrouxar a asserção.

**A auditoria de contraste passa limpa nos dois temas** (era 240 no escuro e 12
no claro). Se voltar a acusar, quase certamente é um token novo fora da escada —
veja a seção de paleta abaixo antes de inventar uma cor.

---

## O que já está NO AR (17/ago)

**A landing de pré-cadastro está publicada e coletando lead de verdade.**
Foi feita inteira pelo celular, com o Victor executando cada passo.

| Peça | Onde | Estado |
|---|---|---|
| Landing | `carrodofreela-landing.vercel.app` | no ar, gravando |
| Repositório da landing | `victorbarrosoc-hub/carrodofreela-landing` — **privado**, só `index.html` na raiz | ok |
| Banco | Supabase, o projeto de `CARRO_SUPABASE_URL` (env na Vercel desde 25/out) | tabela `leads`, RLS ligada, 1 policy |

**Verificado com o Victor, não presumido:** `rls_ligada=true`, `politicas=1`,
`colunas=12`; um cadastro real chegou na tabela; e a anon key exposta no HTML
devolve `[]` num `select` — ela escreve e não lê. **Esse par de testes é o que
autoriza divulgar o link**, e deve ser refeito se a policy for mexida.

⚠️ **O repositório antigo `victorbarrosoc-hub/carrodofreela` está desalinhado.**
Ele é um snapshot achatado (tudo na raiz: `template.html`, `build.js`,
`crew.json`…), de antes da reestruturação em `src/`+`public/`+`test/`. **Nada
das últimas sessões chegou lá** — guildas, inventário, aluguel, contratos,
tempo real, landing. Três coisas pendentes nele, todas para fazer no
computador, não no celular:

1. `index.html` da raiz foi sobrescrito por engano com a landing (tentativa de
   criar `landing/leia.md` pelo celular virou upload por cima). O histórico do
   GitHub guarda a versão anterior.
2. `carrodofreela.vercel.app` está em **404** — a configuração daquele projeto
   Vercel aponta para pasta que não existe naquele layout.
3. ~~**O repositório é público e tem o `crew.json` com os 109 cadastros
   reais.**~~ **RESOLVIDO em 24/ago pelo Victor.** Ficou pendente por vários
   dias porque só ele podia fazer — e é o tipo de pendência que não deve
   dormir: enquanto durou, a lista real de 109 pessoas esteve legível por
   qualquer um. ⚠️ **Apagar ou fechar não desfaz o que já saiu:** quem clonou
   tem, e fork sobrevive aos dois caminhos. A postura daqui para a frente é
   tratar a lista como possivelmente copiada, não como recolhida.

**Por isso a landing ganhou repositório próprio** em vez de uma pasta no repo
antigo: um arquivo na raiz, sem `vercel.json`, sem build — nada que possa
colidir com o protótipo nem exigir configuração.

~~Próximo da lista: registrar `carrodofreela.com.br` e apontar para a landing.~~
**RESOLVIDO (Victor, 12/set): o domínio já está registrado, na GoDaddy.** O que
sobra é encaminhamento — acrescentar o domínio no projeto da Vercel e trocar os
registros lá. ⚠️ **Conferir a renovação automática e para qual e-mail vai o aviso
de vencimento**: domínio que vence não tem desfazer, e é sempre por e-mail que
ninguém leu. E não trocar de registrador — não resolve problema nenhum.

**O e-mail de contato é `carrodofreela@gmail.com`** (19/ago · 5), nos três
lugares em que aparece: rodapé da landing, rodapé do mapa de telas e a aba
Contato do explicador. Antes era `oi@carrodofreela.com.br` — endereço de um
domínio que ainda não existe, num rodapé que convida a escrever. Ninguém
escreve para uma caixa que devolve erro, e o protótipo já tinha uma caixa
de verdade: é a mesma para onde o botão de suporte manda (Web3Forms).
Quando o domínio sair, o `oi@` volta — como redirecionamento para esta,
não como promessa antes da hora.

---

## Publicação

São **dois** artifacts, e confundi-los é republicar por cima do errado:

| o que é | URL | favicon |
|---|---|---|
| **o produto completo** (`FASE=0`) | `https://claude.ai/code/artifact/1a416ea7-8ebc-4d4a-a59d-2ba2f2e7101a` | 🚗 |
| **a Fase 1** (`FASE=1`) | `https://claude.ai/code/artifact/9e092150-bcba-4a9d-b5d2-e95e4b6d2efd` | 🗓️ |

Desde 04/out o publicador devolve o link no formato novo — são os MESMOS
artifacts: completo `https://claude.ai/artifact/4F3bupwhaEtPKB9cLURpo3`,
Fase 1 `https://claude.ai/artifact/LWsBc3WsiegA6qTXRtXQLL`. Os dois formatos
abrem a mesma página; para republicar, qualquer um serve no `url`.

O segundo nasceu em 12/set, quando o Victor perguntou se a Fase 1 estava no
ar: o brechó da fase só se vê no build dela, e o artifact completo mostra o
brechó com carteira, que é comportamento de Fase 2.

⚠️ **De outra conversa, é PRECISO passar a URL no parâmetro `url`** — sem
ela, publicar cria um artifact NOVO em vez de atualizar o que existe.

⚠️ **Quem tem o link vê uma versão FIXADA, não a última.** O leitor do
artifact avisa isso ao ler o completo: *"viewers see a pinned earlier
version, not this live version"*. O dono vê a nova; quem recebeu o link vê
a que foi fixada. Se o Victor mandar o link para alguém conferir uma leva
nova, é preciso fixar a versão nova no menu do artifact — senão a pessoa
olha o produto de semanas atrás e reporta defeito já consertado.
Publicar sempre a partir de **`public/artifact.html`** (o `public/index.html`
virou documento completo e o visualizador aninharia dois documentos). De outra
conversa, é preciso passar essa URL no parâmetro `url`.

⚠️ **ISTO MUDOU (24/ago): o push SAI deste ambiente.** `git push` para
`victorbarrosoc-hub/carrodofreela-app` funciona direto — foi assim que a leva
do aluguel na Fase 1 subiu. O que NÃO sai é o resto da rede: `api.github.com`
responde 200 mas recusa repositório não anexado à sessão, e o proxy bloqueia
`carrodofreela.com.br` no CONNECT, então **não dá para conferir o domínio
daqui** — quem confere o que está no ar é o Victor.

O parágrafo anterior dizia que o push não saía e que o fluxo era entregar
tarball para ele rodar `git push --force`. Isso está morto; deixado registrado
só para ninguém reviver o tarball por engano.

### ⚠️ `npm run publicar` — EU subo, ele autoriza (24/ago)

Victor: *"quero que você suba os index e versões de forma automática quando
eu autorizar no final dos prompts. Não quero ter que ficar baixando pra
atualizar lá no repositório."* Ele estava baixando 13 MB no celular e
reenviando por GitHub web a cada leva. Acabou.

```
npm run publicar -- "mensagem do commit"    publica
npm run publicar -- --seco                  confere tudo e não envia
```

**A ordem nova, que substitui a de 19/ago:** republicar o artifact → ele
olha → **ele autoriza** → `npm run publicar`. O `SendUserFile` com os sete
arquivos vira exceção, não rotina: só quando ele quiser os arquivos na
mão (abrir sem domínio, guardar uma versão).

⚠️ **AUTOMÁTICO NÃO É SOZINHO.** O script só roda quando ele autoriza NA
CONVERSA. Empurrar publica no domínio em um ou dois minutos — é ação de
fora, e ação de fora tem dono. Nunca rodar por iniciativa própria "porque
a leva fechou".

O que `src/publicar.js` faz, e por que cada parte existe:

1. **Travas antes de gerar qualquer byte** — se uma falhar, nada é gerado
   e nada sobe: (a) `test/sem-nome-real.js` tem de passar; (b) `src/crew.json`
   conferido contra o **selo**; (c) contagem de suítes ≥ 60, que é o detector
   de árvore-resto-de-reset.

   ⚠️ **A TRAVA (a) EXIGIA `crew.local.json` E DEIXOU DE EXIGIR (13/set), e
   isso não é afrouxamento — é troca de instrumento.** O desenho antigo tinha
   um furo que só apareceu quando mordeu: ele pedia, para autorizar a
   publicação, **justamente o único dado do projeto sem cópia em lugar
   nenhum**. Enquanto o arquivo existia, isso parecia rigor. No dia em que o
   container o levou, virou publicação travada **para sempre** — não uma leva,
   todas as levas daí em diante.
2. **Gera os sete anônimos** direto na raiz do clone e **confere no
   arquivo escrito** — FASE certa, versão certa, nome reduzido de fato,
   zero telefone. Confere o arquivo, não a intenção.
3. **Devolve os builds internos** ao `public/` daqui. Sem isso a próxima
   bateria roda contra um build anônimo que não é o que ela testa.
4. **Rebaseia no `origin/main`** antes de commitar — o Victor sobe coisa
   pelo celular e o remoto anda sem mim (já aconteceu duas vezes).
5. **Push com quatro tentativas** (2s, 4s, 8s, 16s) para engasgo de rede.
6. **(19/out · 2) Blinda o envio**: confere o `vercel.json` da raiz
   (redirect de `/app/…`, `noindex`, cache da `m/`, os cabeçalhos de
   `FIXOS`), roda `src/blindar.js` no clone — CSP que quebra a página
   reprova o envio —, e escreve no clone o `vercel.json` com a CSP calculada
   e o `.vercelignore` em lista de permitidos. Ver a seção de 19/out · 2.

⚠️ **Desde 18/out · 3 o proxy DEIXA PASSAR `carrodofreela.com.br`** (antes
negava o CONNECT). Com `curl` dá para conferir o que o domínio SERVE — a
`VERSAO` dentro do HTML, os arquivos de `m/`, os cabeçalhos —, e foi assim
que o travamento do Safari foi reproduzido com o build exato do ar. A
conexão às vezes cai (`SSL_ERROR_SYSCALL`): repetir. O que continua valendo:
**servido não é visto** — quem confirma no aparelho é o Victor, e "no ar"
só se diz do que o `curl` devolveu, nunca de como a tela ficou.

---

## Evidência de campo (25/ago)

Três prints do Victor, em duas rodadas. **Nenhum nome, telefone ou nome de
empresa fica aqui — só a FORMA.**

**Rodada 1 — dois grupos, observados.** Num, o contratante pergunta quem
está livre sábado à noite; duas pessoas respondem no mesmo minuto, mas
dezenove minutos depois ele reclama que "só um respondeu" — a confirmação
final vem por áudio de cinco segundos, citando outra mensagem. No outro,
no mesmo grupo e com meia hora de diferença: um cartão de equipamento à
venda (preço item a item, "no precinho pra sair logo") e um anúncio de
serviço ("disponível para novos trabalhos, valor a combinar, chamem no
PV"), um embaixo do outro na rolagem.

⚠️ **Isto é literalmente o feed de 25/ago · 6** — post de quem procura
trabalho misturado com cartão do brechó, ordenados pela hora. A praça já
funciona assim; o que muda é que ali tudo escorre pra cima em duas horas,
sem registro nem preço fixado.

⚠️ **E o primeiro print também mostra o lado FORTE do WhatsApp**: quem
respondeu, respondeu em segundos. Alcance e hábito o grupo já tem. O que
falta é registro, data e preço — a promessa não é "aqui você acha gente",
é "aqui não se perde o que foi combinado". Vender alcance contra o
WhatsApp é escolher o campo em que ele perde para o produto.

**Rodada 2 — o Victor testou na própria pele.** Postou num grupo a chamada
de "Passar o carro" em texto puro, com a frase do próprio produto: *"Olha
o Carro do Freela passando... Quem tá disponível pra fazer operação de
câmera amanhã?"* — sem resposta visível. Foi então no direto com um
contato, que devolveu três cartões de gente e disse "vê com essa galera".

⚠️ **A frase do Victor de volta é a tese do produto, dita com as próprias
palavras: "Eu conheço uma ruma de gente, só não queria ter que ir um em
um pra saber que eles desenrolam."** Duas coisas separadas nessa frase:
DISPONIBILIDADE (quem tá livre — o que `buscar`/"Quem tá na escuta"
resolve) e CONFIANÇA DE ENTREGA ("que eles desenrolam" — o que portfólio,
perfil-canal e a avaliação pós-job resolvem, e que não existe em grupo
nenhum).

⚠️ **A resposta que voltou mede o tamanho do buraco.** Dois áudios: um
dizendo "fulano tá disponível, beltrano depende, depende um pouquinho..."
e o segundo, sete segundos depois, só "Ai eu não sei." Isso é o ESTADO que
a plataforma estrutura em campo (livre/preso/depende, por pessoa, com
motivo) — aqui ele mora só na cabeça de uma pessoa, sai em voz hesitante,
e evapora assim que a conversa rola pra baixo.

⚠️ **O que isto NÃO prova**: dor comprovada não é disposição de trocar de
ferramenta. Isto valida o PROBLEMA — os dois lados da fricção, achar quem
tá livre e saber se dá conta —, não a migração para o produto.

---

## Onde o produto está

Rodando ponta a ponta no protótipo: homepage pública, login pela conta oficial
(e-mail e senha) e pelo Google, nos dois tipos de conta, busca por praça e data, montar equipe com custo somando,
passar o carro com a corrida, caixa de propostas, agenda do freela, custódia,
painel do job (as duas pontas leem a mesma coisa), perfil-portfólio editável,
brechó com ficha por categoria + avaliador de preço + oportunidades +
impulsionado, carteira em take, moeda em 3D explicada, menu lateral com FAQ,
chat por negociação, tema claro/escuro e identidade sonora.

**Victor disse que o protótipo ainda não está pronto e que vai mandar melhorias
aos poucos.** Espere ajustes de produto, não uma virada de escopo.

Próximos passos que ele conhece e ainda não priorizou:

1. Sair do protótipo: o `docs/plano.html` diz que a fase 0 é **falar com o
   parceiro de pagamento antes de abrir o CNPJ**, porque a exigência deles (CNAE,
   capital social) define como o CNPJ tem que nascer. Em paralelo, registrar
   `carrodofreela.com.br` — **feito, na GoDaddy (12/set)**.

---

## Como trabalhar aqui

- Edite `src/template.html`, rode `npm run build`, teste, **depois** commite.
- ⚠️ **Mexeu em algo que o sistema de fases toca? `npm run build:fases`.**
  `npm run build` gera só o `index`, e a suíte `versoes` testa os SETE
  arquivos — build velho passa verde testando código que não existe mais.
  Ela hoje compara `mtime` e reprova dizendo qual está defasado, mas o
  hábito é mais barato que a reprovação.
- Commits em português, corpo explicando *por quê*, não *o quê*.
- Rode as suítes afetadas antes de dizer que terminou; se uma quebrou por
  mudança de navegação, conserte o teste no mesmo commit.
- Ao terminar uma mudança visível: build → testes → commit → republicar o
  artifact. **Aí para.** Nem tarball nem `index.html` — os dois são sob
  demanda. O artifact é onde ele confere; o arquivo é o que ele sobe depois de
  aprovar. Mandar antes é pular a etapa dele.
- Screenshot do Playwright é a forma de conferir o resultado. Asserção que passa
  não garante que a tela está certa: o botão de remover já ficou como caixa
  branca do browser com todos os testes verdes.
