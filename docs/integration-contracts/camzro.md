# CAMZRO → edição, SOBEDESCE, Synquei e Maestro (`camzro.clip/1`)

Estado: **v1, 09/11/2026**. Produtor: CAMZRO (`products/camzro`, nome provisório, **não lançado**: fechado no gate pela
migração HUB `0065`). Consumidores automáticos: **nenhum ainda**. Tudo sai como arquivo, por ação da pessoa (descarga,
compartilhar, exportar). Nenhuma imagem, som ou ficha vai para servidor.

## O clipe

- Nome no padrão das câmeras de cinema: `<câmera><rolo>C<clipe>_<AAMMDD>_<aparelho>` (ex.: `A001C007_261109_K3F2`), com
  `<aparelho>` de 4 caracteres fixo por aparelho: dois celulares nunca geram o mesmo nome (`app/nucleo/claquete.js`).
- Vídeo: MOV (padrão) ou MP4, H.264, HEVC, AV1 ou VP9 conforme o aparelho, **cadência constante** (o quadro tem lugar fixo
  na linha do tempo), áudio PCM 24 ou 16 bits (MOV) ou AAC. Enquanto grava, é um MP4 fragmentado
  (`<nome>.gravando.mp4`, um fragmento por segundo, gravado no lugar, sem arquivo temporário): se o app cair, o take
  volta até o último fragmento. Ao parar, é reempacotado (sem recomprimir) e conferido pela duração.
- Ao lado: `<nome>.json` (a ficha abaixo), `<nome>.jpg` (miniatura 192×108) e, se havia LUT no monitor, `<nome>.cube` (o
  arquivo de vídeo nunca leva a LUT).

## A ficha `camzro.clip/1` (`<nome>.json`)

Exemplo gerado pelo código: [exemplos/camzro.clip.v1.json](exemplos/camzro.clip.v1.json) (`node scripts/exemplos.mjs`;
`test/contrato.test.js` confere o exemplo e que todo campo está aqui). Campo desconhecido fica `null`, nunca inventado.

| Campo                                                                                          | O que é                                                                               |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `formato`                                                                                      | sempre `camzro.clip/1`                                                                |
| `arquivo`, `clipe`                                                                             | nome do vídeo (com extensão) e do clipe                                               |
| `criado`                                                                                       | início do take (ISO 8601, pelo relógio do set quando acertado)                        |
| `duracao_s`, `quadros`, `fps`                                                                  | duração, quadros e cadência real (23,976 = 24000/1001)                                |
| `timecode`, `timecode.inicio`, `timecode.fim`                                                  | SMPTE; `fim` é exclusivo, como no EDL e no ALE                                        |
| `timecode.drop_frame`                                                                          | `;` antes dos quadros em 29,97 e 59,94 DF                                             |
| `timecode.fonte`                                                                               | `relogio-do-set` (acertado pela rede, abaixo de 1 quadro) ou `relogio-do-aparelho`    |
| `claquete`, `claquete.projeto`                                                                 | a claquete do take                                                                    |
| `claquete.cena`, `claquete.plano`, `claquete.take`                                             | cena (12, 12A), plano (A, B…), take                                                   |
| `claquete.camera`, `claquete.rolo`                                                             | letra da câmera e rolo (`A001`)                                                       |
| `claquete.bom`, `claquete.notas`                                                               | bom take (círculo) e notas                                                            |
| `video`, `video.codec`, `video.largura`, `video.altura`                                        | `avc`, `hevc`, `av1`, `vp9` ou o tipo do gravador simples                             |
| `video.bitrate`, `video.quadro_chave_s`                                                        | bits/s pedidos; intervalo de quadro-chave (0 = só quadros-chave)                      |
| `video.quadros_perdidos`, `video.motor`                                                        | buracos na linha do tempo (o aparelho não deu conta) e `webcodecs` ou `mediarecorder` |
| `audio`, `audio.codec`, `audio.taxa`, `audio.canais`                                           | `pcm-s24`, `pcm-s16`, `aac`; `null` sem áudio                                         |
| `camera`, `camera.aparelho`, `camera.lente`                                                    | id do aparelho e a lente digitada                                                     |
| `camera.iso`, `camera.obturador_s`, `camera.angulo`                                            | o que a câmera disse no início do take (`null` onde o aparelho não informa)           |
| `camera.kelvin`, `camera.zoom`, `camera.nd`                                                    | balanço, zoom e o ND na lente (densidade)                                             |
| `camera.anamorfico`, `camera.lut_monitor`                                                      | fator de desanamorfizar (o editor aplica) e o nome da LUT do monitor                  |
| `ecossistema`, `ecossistema.maestro`                                                           | elo com o roteiro do Maestro (abaixo), ou `null`                                      |
| `ecossistema.maestro.contrato`, `ecossistema.maestro.roteiro_id`, `ecossistema.maestro.versao` | `maestro.roteiro/1`, o roteiro e a versão salva                                       |
| `ecossistema.maestro.cena_id`, `ecossistema.maestro.plano_id`                                  | a cena e o bloco `plano` do roteiro                                                   |
| `ecossistema.sincronia`, `ecossistema.sincronia.bip_s`                                         | quando tocou o bip de sincronia, em segundos desde o começo do take                   |
| `ecossistema.sincronia.hz`, `ecossistema.sincronia.ms`, `ecossistema.sincronia.assinatura`     | 1000 Hz, 160 ms, `tpeasy` (a mesma assinatura do bip do TPeasy)                       |

Opcionais, gravados depois: `fechado` (o take foi reempacotado), `recuperado` (voltou de uma queda),
`camera.lut_arquivo` (o `.cube` ao lado) e `descargas` (`[{ pasta, xxh64, em }]`, uma por descarga conferida).

## Descarga conferida (para o SSD do set, o HD ou uma pasta do computador)

No Chrome/Edge do computador (File System Access), **Clipes › Descarregar**:

```
<pasta escolhida>/
  <projeto ou CAMZRO>/<AAMMDD>/<rolo>/A001C007_261109_K3F2.mov
                                      A001C007_261109_K3F2.json
                                      A001C007_261109_K3F2.cube   (se havia LUT)
  CAMZRO_copia_<AAAAMMDDhhmm>.xxh64     "<xxh64>  <caminho relativo>" por linha (formato do xxhsum e do SOBEDESCE)
  CAMZRO_<carimbo>_DaVinci.csv          metadados para o DaVinci Resolve (abaixo)
  CAMZRO_<carimbo>.ale                  Avid Log Exchange
  CAMZRO_<carimbo>_relatorio.html       relatório de câmera para imprimir
```

Cada vídeo: xxh64 da origem, cópia, **releitura do destino** e xxh64 de novo; só iguais contam e entram em `descargas`.
Uma diferença para a descarga inteira, sem marcar nada. O CAMZRO nunca apaga clipe sozinho.

## DaVinci Resolve (CSV) e Avid (ALE)

- CSV (Media Pool › Importar metadados): `File Name, Scene, Shot, Take, Good Take, Camera #, Angle, Roll Card #, Lens
Type, ISO, Shutter, White Point (Kelvin), Camera FPS, Comments, Keywords, Description` — os mesmos nomes que o Synquei
  usa no Resolve (`products/synquei/app/js/organizar.js`).
- ALE: `Name, Tracks, Start, End, Tape, Source File, Scene, Take, Camroll, Circled, Comments`.

## Synquei

O bip de sincronia do CAMZRO (claquete › Bip ao gravar, ou Bater) é **o mesmo do TPeasy**: seno de 1 kHz, ataque seco,
0,25 de pico e queda exponencial até 0,0001 em 160 ms (`app/nucleo/audio.js`, conferido em teste). O Synquei sincroniza
pelo som (correlação dos ataques) e já reconhece esse bip (`acharBips`); o flash na tela marca a mesma batida na
imagem. O timecode da hora do dia, acertado pelo relógio do set, entra como reserva para clipes sem som em comum.

## Maestro

Entrada, não saída: **Claquete › Trazer do Maestro** lê o arquivo `maestro.roteiro/1` ([maestro-roteiro.md](maestro-roteiro.md)).
Cada cena com blocos `plano` vira a decupagem: planos A, B, C… em ordem, com a sigla, o ângulo, o movimento, a lente e a
cadência pedidos. "Próximo plano" anda pela lista; a lente do roteiro entra na ficha. O clipe leva de volta
`ecossistema.maestro`. Nada de rede: o arquivo é o que a pessoa escolheu.

## Presets (`camzro.preset/1`)

`<nome>.camzro.json` com formato, câmera (sem lente e microfone do aparelho), monitor e a base da claquete. Levar e
Trazer entre aparelhos; validado na volta (`app/estado.js`).

## Servidor

O CAMZRO só fala com o próprio site: `GET /api/camzro/hora` (`{ ok, agora }`, para o relógio do set, só depois do gate)
e o login único (`/api/zro/*`, cliente `camzro-web`, cookies `cz_*`), com o repasse do Set (`/api/zro/set/*`).
