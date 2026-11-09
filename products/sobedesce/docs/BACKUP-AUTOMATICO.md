# Backup Automático (Cartões → Projetos)

Para o logger de set e para o backup rápido num evento: o projeto é configurado uma vez e, depois, é só espetar o
cartão. O app reconhece de quem é, copia só o que ainda não foi passado para a pasta certa, confere e diz se pode
formatar. Sem internet: nada vai para o Drive.

## Como usar

1. **Cartões → Backup Automático → Novo projeto:** o nome (vira a pasta principal), **o que vai passar** (vídeos,
   fotos ou os dois; a pergunta é obrigatória no projeto novo, o antigo passa tudo), os destinos (o HD principal e até
   3 backups; o cartão é lido uma vez e gravado em todos) e, se quiser, "Ejetar o cartão ao terminar".
2. **Começar sozinho ao espetar** já vem ligado ao criar o projeto (a chave fica no painel). Desligado, cada disco
   plugado aparece em "Discos plugados" e espera "Usar como cartão" / "Copiar agora".
3. **Espete o cartão.** Na primeira vez, um toque diz de quem ele é: um dono que já existe ou um novo, com nome e
   câmera ("Ana" + "FX30") e **para onde vai** (Cenas, Fotos ou separar; sugerido pelo que o cartão tem). A câmera vem
   preenchida quando o app consegue ler (Sony). "Ignorar este disco" serve para pendrive, HD de outra coisa etc.
   **"Escolher o que passar"** (na pergunta ou em "Escolher…" no disco): marca os tipos (vídeos, fotos, outros) e as
   pastas do cartão; vale só para aquela descarga.
4. **Pronto.** Nas próximas vezes, o mesmo cartão passa sozinho. Na tela: o andamento (velocidade, arquivos, tempo que
   falta), a fila (um cartão por vez), os cartões espetados com o estado de cada um, os donos da diária e o histórico.
5. **No fim de cada cartão:** "Cartão OK, pode formatar" (todos os arquivos do cartão estão em todos os destinos,
   conferidos) ou a lista do que falta. Também aparece um aviso do sistema.
6. **Nova diária:** botão na diária. Se a data mudou desde a última descarga, a tela sugere começar a próxima (não
   muda sozinha: evento que passa da meia-noite continua na mesma diária).

## Pastas

```
<destino>/<Projeto>/Diária 01/Cenas/Ana - FX30/Cartão 01/<pastas do cartão, como estão>   (vídeo e o resto)
<destino>/<Projeto>/Diária 01/Fotos/Ana - FX30/Cartão 01/<pastas do cartão, como estão>   (foto)
```

- **Fotos e vídeos** (`src/backup/midia.js`): pela extensão. Vídeo: MP4, MOV, MXF, BRAW, R3D, MTS… Foto: JPG, HEIC,
  RAW (ARW, CR3, NEF, RAF, DNG…), TIFF, PNG e o XMP. O resto (XML, índice, áudio, miniatura) é "outros" e vai junto
  com o vídeo.
- **O projeto** passa só vídeos (as fotos ficam no cartão), só fotos (só elas, em Fotos) ou os dois.
- **O dono** (com os dois): separar (vídeo em Cenas, foto em Fotos, o mesmo "Cartão NN"), tudo em Cenas ou tudo em
  Fotos. Seção sem arquivo não cria pasta.
- **Ficou algo de fora** (só vídeos, só fotos ou a escolha da pessoa): o fim diz "Passou o escolhido (o resto ficou no
  cartão)", nunca "pode formatar", e o "Ejetar ao terminar" não ejeta.

- **Nome da pasta do dono** (opcional): no primeiro toque ou no lápis do dono, ex.: `01_CAMERA_A_LEO_FX30`. Vazio =
  "Nome - Câmera". Editar muda só os próximos cartões (os que já passaram ficam onde estão). Dois donos não podem
  ter a mesma pasta: os "Cartão NN" de um se misturariam com os do outro.
- **"Cartão NN"** é por cartão físico, dentro do dono e da diária. Protege contra nomes iguais: um cartão formatado
  que recomeça em C0001, ou os arquivos de índice da câmera (MEDIAPRO.XML), não vão por cima de nada.
- **Segunda leva do mesmo cartão (sem formatar):** mesma pasta; copia só o que é novo.
- **Cartão formatado da mesma câmera** (Sony): o número de série do corpo, no XML ao lado de cada clipe, diz o dono;
  vira o próximo "Cartão NN".
- **Diária nova:** a numeração dos cartões recomeça (Diária 02 / … / Cartão 01).

## Como funciona

- **Vigia dos discos** (`src/backup/volumes.js`), a cada 3 s, sempre que há um projeto aberto (ligado ou não: a tela
  mostra todo disco plugado, como no RushDock):
  - macOS: `/Volumes`, sem a raiz (atalho), ocultos, o disco interno do Mac e imagem de disco. Id = VolumeUUID do
    `diskutil info -plist`. **O cartão no leitor SD embutido** (MacBook Pro, Mac Studio) se diz `Internal`, mas é
    `RemovableMedia`/`Ejectable` (ou `BusProtocol` = Secure Digital): entra. Antes ele era descartado como disco
    interno, e por isso o cartão "não aparecia".
  - Windows: letras D: a Z:, sem CD/DVD e unidade de rede (PowerShell `Get-Volume`). Id = número de série do `vol`
    ("XXXX-XXXX"; o texto em português também funciona).
  - Linux: `/media/$USER` e `/run/media/$USER`. Id = UUID do `findmnt`.
  - Sem id do sistema: rótulo + capacidade.
  - Disco que contém um destino é ignorado (é o HD do backup, não um cartão).
- **De quem é** (`src/backup/servico.js`): 1) id do volume já visto no projeto; 2) serial da câmera no XML da Sony
  (`PRIVATE/M4ROOT/CLIP/*.XML` ou `XDROOT/Clip`, `<Device modelName serialNo>`; `src/backup/camera.js`); 3) senão, o
  pedido de um toque (SSE `backup-pedido` + aviso do sistema). O modelo da câmera pré-seleciona o dono quando só um
  dono tem aquela câmera ("mesma câmera"). Das outras marcas, só o tipo pela estrutura (GoPro, DJI, Canon,
  Panasonic, Blackmagic) para sugerir o nome.
- **A cópia** é o motor do "Entre discos" (`src/discos/`), numa instância própria (não mexe na tela Comparar):
  - compara por caminho e tamanho; copia só o que é novo; confere o copiado lendo de volta (xxHash64); grava o
    relatório `SOBEDESCE_copia_<data>.xxh64` na pasta do cartão em cada destino;
  - cada arquivo é gravado como `<nome>.sobedesce-parcial` e só ganha o nome final depois de completo e sincronizado:
    o Premiere/DaVinci, puxando da pasta em tempo real, nunca pega um clipe pela metade;
  - **comparativo automático:** depois de copiar, compara tudo de novo; se sobrou algo (falha), tenta mais uma vez;
  - **mesmo nome, outro tamanho no destino:** nunca grava por cima. Exceção: arquivo pequeno (até 32 MB) e mais novo no
    cartão (o índice/XML que a câmera reescreve entre uma leva e outra): o antigo vai para
    `.sobedesce-anteriores/<data>/` dentro da pasta do cartão e o novo é copiado. O resto é o **contador zerado** (a
    câmera voltou a numerar do zero, 09/11/2026): o arquivo novo vai, com a mesma conferência, para a pasta
    `Cartão NN · contador zerado`, ao lado do cartão. O antigo fica onde estava. Se o mesmo cartão volta, ele já está
    lá e não é copiado de novo (`procurarTudo`). Só o que não deu para copiar vira alerta, e aí o cartão não fica "OK";
  - **gravação interrompida** (`src/backup/imprevistos.js`, 09/11/2026): depois da cópia, o app lê só o cabeçalho de
    cada MP4/MOV/BRAW/INSV (um bloco que passa do fim do arquivo ou a falta do índice `moov`) e de cada JPEG (sem o
    marcador do fim). O arquivo é copiado igual ao do cartão, mas a tela, o aviso e a notificação dizem "Confira antes
    de formatar" e listam os arquivos. Nada é alterado;
  - **proxies e restos do sistema ficam no cartão:** LRV, LRF, THM, `._*`, `.DS_Store`, `Thumbs.db`. Não contam como
    "ficou de fora", então não seguram o "pode formatar" nem o ejetar. A opção do projeto "Levar os proxies da câmera"
    (`levarProxies`) leva tudo.
- **Excluir o projeto** (Editar ou "Excluir" no painel, com um segundo toque): para a descarga de agora, tira o projeto
  da lista e o painel some; espetar o cartão de novo não copia mais nada (sem projeto, não há vigia). Os arquivos nos
  destinos ficam.
- **Limpar histórico:** tira as descargas da lista. O total "Já passou", a numeração dos cartões e o `descargas.jsonl`
  ficam.
- **Fila:** um cartão por vez, na ordem em que entraram.
- **Destino desconectado:** a descarga espera ("Esperando Backup SSD") e começa sozinha quando ele volta.
- **Cartão retirado no meio:** a descarga para com "O cartão saiu antes de terminar. Espete de novo: continua de onde
  parou." O arquivo pela metade é apagado; ao espetar de novo, a comparação copia só o que falta.
- **Ejetar:** opção do projeto (só quando está tudo certo; recusado logo depois da cópia, tenta de novo em 3 s e em 8 s e, sem conseguir, o cartão e o aviso dizem quem segura) e botão por cartão: `diskutil eject` no Mac (recusado,
  tenta `diskutil unmount` só daquele volume: HD com duas partições, uma em uso; recusado de novo, a mensagem diz quem
  segura o disco, pelo PID que o diskutil aponta: o Spotlight, o DaVinci…; nunca força),
  `Shell.Application` → Eject no Windows, `gio mount -e` no Linux.
- **Dados** em `<pasta de dados do app>/backup-automatico.json` (gravação atômica: temporário + rename): projetos,
  destinos, diárias, donos, mapa cartão → dono, serial → dono, ignorados, numeração dos cartões e o histórico (até 500
  descargas: data, diária, dono, cartão, pasta, arquivos, bytes, duração, resultado).

- **"Usar como cartão"** (`POST /api/backup/usar`): qualquer disco plugado que não é destino entra na hora, mesmo
  ignorado ou com o automático desligado. Conhecido → fila; novo → a pergunta "de quem é?".
- **Sem licença do macOS para ler o cartão** (EPERM/EACCES): a mensagem diz onde liberar (Privacidade e Segurança →
  Arquivos e Pastas → SOBEDESCE → Volumes Removíveis).

## Resumo de cada cartão (para o Synquei)

No fim de cada cartão (menos cancelado), cada destino ganha uma linha em `<destino>/<Projeto>/.sobedesce/descargas.jsonl`:

```json
{"v":1,"app":"sobedesce","id":"dsc…","quando":"2026-10-24T14:02:11.000Z","data":"2026-10-24","projeto":"Show","secao":"cenas",
 "diaria":{"n":1,"nome":"Diária 01"},"dono":{"id":"don…","nome":"Ana","camera":"FX30","pasta":"Ana - FX30"},
 "cartao":{"n":1,"nome":"SD FX30","volId":"uuid:…","pasta":"Diária 01/Cenas/Ana - FX30/Cartão 01"},
 "resultado":"ok","copiados":5,"bytes":12345,"arquivos":[{"rel":"PRIVATE/M4ROOT/CLIP/C0001.MP4","size":3001}]}
```

- Uma linha por descarga e por seção (`secao`: `cenas` ou `fotos`; o cartão separado ganha duas, com o mesmo `id`).
  A segunda leva do mesmo cartão é outra linha, com a mesma pasta). O arquivo só cresce: quem
  lê guarda até onde já leu.
- `cartao.pasta` é relativo à pasta do projeto, com `/`. `arquivos[].rel` é relativo à pasta do cartão (até 50 mil).
- O Synquei vigia esse arquivo e, a cada cartão, organiza a mídia no projeto do DaVinci (bins por diária, câmera e
  cartão, cor por câmera, metadados e a sequência sincronizada da diária). Falhar ao gravar o resumo nunca atrapalha a
  descarga.

## Rotas locais (`src/server/backup.js`)

| Rota | O quê |
| --- | --- |
| `GET /api/backup` | o estado (também em `/api/state` → `backup` e no SSE `backup`) |
| `POST /api/backup/projetos` `{ nome, destinos[], ejetar, ligar?, midia?, synquei? }` | cria e abre o projeto (`ligar` padrão: sim; `midia`: `tudo`, `videos` ou `fotos`) |
| `POST /api/backup/projeto` `{ id, nome?, destinos?, ejetar?, midia?, synquei? }` | edita |
| `POST /api/backup/abrir` / `apagar` `{ id }` | troca de projeto / tira da lista (os arquivos ficam) |
| `POST /api/backup/ligar` `{ ligado }` | liga/desliga o vigia |
| `POST /api/backup/diaria` `{}` ou `{ n }` | nova diária / volta para uma diária |
| `POST /api/backup/responder` `{ caminho, donoId \| nome+camera(+pasta) \| ignorar, secao?, escolha? }` | o toque "de quem é" (`secao`: `separar`, `cenas` ou `fotos`) |
| `POST /api/backup/conteudo` `{ caminho }` | o que tem no cartão: por tipo e as pastas com vídeo ou foto |
| `POST /api/backup/escolher` `{ caminho, escolha: { tipos[], pastas[]? } }` | "Escolher o que passar" (só desta vez) |
| `POST /api/backup/historico/limpar` | limpa a lista do histórico |
| `POST /api/backup/repetir` / `ejetar` `{ caminho }` | copiar de novo / ejetar |
| `POST /api/backup/usar` `{ caminho }` | "Usar como cartão" / "Copiar agora" |
| `POST /api/backup/dono` `{ id, nome?, camera?, pasta?, secao? }` | edita o dono (a pasta vale para os próximos cartões) |
| `POST /api/backup/cancelar` | para a descarga de agora |
| `POST /api/backup/ignorados/limpar` | volta a perguntar pelos discos ignorados |

## Testar

`test/backup-automatico.test.js`: listagem e id dos discos por sistema (comandos falsos), o XML da Sony, o primeiro
toque e a cópia para os dois destinos, a segunda leva só com o novo (e o índice reescrito), o cartão formatado pelo
serial, o destino que espera, ignorar disco, o "mesmo nome, outro tamanho" que vira alerta e a persistência.

Falta testar com cartões e leitores de verdade (Mac e Windows): o VolumeUUID/serial de cartões formatados em câmera,
o `vol` no Windows em português e o ejetar.

## Espaço e quanto já passou

- **Cada destino** mostra o espaço livre, o tamanho do disco e uma barra do que já está ocupado. Com a média dos
  cartões da diária (ou do projeto, se a diária ainda não tem descarga), diz quantos cartões ainda cabem. Menos de 10%
  livre ou menos de 2 cartões: fica em laranja. O espaço é lido a cada varredura (3 s).
- **Já passou:** o total do projeto (GB, cartões e arquivos, somando todas as diárias) e o da diária atual. O total do
  projeto fica guardado no `backup-automatico.json` (projetos antigos somam pelo histórico).

## Frames do cartão

Com o cartão OK, **Frames do cartão** abre Estúdio › Frames na pasta do vídeo daquele cartão no primeiro destino
(`pastaVideo` na descarga): um frame por clipe, com a LUT e o ajuste que o dono usou da última vez (docs/FRAMES.md,
"Pasta ou cartão"). Os frames ficam em Downloads › Frames; o cartão e a cópia não mudam.

Com **Frames com cor ao terminar o cartão** ligado no projeto (`precolor`), isso acontece sozinho a cada cartão OK, com a
cor que o dono usou por último; o botão vira "Ver os frames do cartão".

## Preparar no Synquei

- **Usar o Synquei** (chave do projeto, ligada por padrão): desligada, a tela não mostra o tipo nem o "Preparar no
  Synquei". O `descargas.jsonl` continua (o HUB também lê).
- **Tipo no Synquei** (opcional, no projeto): videoclipe, casamento, show… (os mesmos de `products/synquei/app/js/tipos.js`;
  `test/synquei-ponte.test.js` confere). Vai em cada linha do `descargas.jsonl` (`tipo`) e no link.
- **Gravando agora** (com o Synquei ligado): pílulas com os momentos do tipo do projeto (casamento: Making da noiva,
  Cerimônia, Festa…; sem tipo, um campo livre). O escolhido vai em cada cartão que entrar na fila a partir dali
  (`momento` na linha do `descargas.jsonl`, `POST /api/backup/momento`); "Automático" deixa o Synquei decidir pela
  pasta e pelo horário. Os nomes são os do Synquei (`MOMENTOS_SYNQUEI`, conferidos em `test/synquei-ponte.test.js`).
- **Relatório** (ao lado do Synquei, assim que a diária tem um cartão): `GET /api/backup/relatorio?id=&diaria=` monta a
  página da diária a partir do `descargas.jsonl` (`src/backup/relatorio.js`): câmeras, cartões, tamanho, o que pede
  atenção e o botão "Preparar no Synquei" (link `synquei://organizar`). Sem script; só diz conferido com xxHash64.
- Com o cartão OK, o painel mostra **Preparar no Synquei**. O motor (`POST /api/backup/synquei`) acha a pasta do projeto no
  primeiro destino que já tem o `descargas.jsonl` e monta `synquei://organizar?pasta=…&tipo=…` (`src/backup/synquei.js`).
- No app, a ponte (`sobedesce:abrir-synquei`) confere se o Synquei está instalado; sem ele, abre a central Absolute ZRO
  (`absolutezro://baixar`) se estiver no computador, senão a página Downloads (absolutezro.com/baixar).
- Download do Drive: o mesmo botão aparece no lote de download concluído e conferido (ver `docs/ARCHITECTURE.md`,
  "Preparar no Synquei").
- O Synquei pergunta antes de adicionar a pasta e não move nem renomeia nada (`products/synquei/desktop/link-organizar.cjs`).
