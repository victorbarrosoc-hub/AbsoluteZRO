# ADR 0044 — Plataforma de fotos: decupagem, revelação RAW e predefinições, no aparelho

**Status:** proposta (13/11/2026, pedido do titular). Id técnico `foto` (fica para sempre); nome provisório **LUXON**,
com o motor **Latitude** e a nota **Magnitude**. Nasce **fechada** no gate (`zro.product_release`, ADR 0023, migração
`0065`): não aparece para ninguém além do papel `admin` até o titular lançar. Sem deploy: projeto Vercel, domínio,
cliente OIDC, schema no Supabase e bucket pedem autorização. Contrato dos módulos em
[`products/foto/docs/ARQUITETURA.md`](../../products/foto/docs/ARQUITETURA.md).

## Contexto

O titular pediu (13/11/2026) uma plataforma de fotos para o ecossistema: escolher as boas de um ensaio (decupagem),
tratar o RAW com margem de exposição de verdade, usar predefinições próprias e as do Lightroom, tirar o estilo de uma
foto de referência, deixar o cliente escolher e tratar em lote.

- Hoje esse trabalho se divide em vários programas, quase todos pagos em dólar: um para decupar, um para revelar, um
  para a galeria do cliente. Nenhum é do ecossistema nem usa a conta Absolute ZRO.
- A **Revela** (`finishing`, ADR 0015/0016/0030) é o laboratório de **cor de vídeo**: LUT, CST, entrega. O território
  dela (película, revelação do latente, amarelo e roxo) não serve para foto parada, e misturar os dois confunde.
- Foto de cliente é material sensível: quanto menos sair do aparelho, melhor.

## Decisão proposta

1. **Produto novo, separado da Revela.** `products/foto/`, id `foto`. A Revela fica com a cor de vídeo; a foto (RAW,
   decupagem, galeria) fica aqui.
2. **Nomes (provisórios, o titular decide):** **LUXON** para o produto (par do RADION: partícula que anda à velocidade
   da luz), **Latitude** para o motor de revelação e as margens de exposição, **Magnitude** para a nota da decupagem.
   O nome mora num arquivo só (`products/foto/app/nome.js`); o catálogo marca `provisional_name`.
3. **Tudo no aparelho.** Ler, decupar, revelar e exportar rodam no navegador. A única coisa que sobe é a prévia
   reduzida, com marca-d'água, de uma galeria que a pessoa mandou publicar. Nada é movido, renomeado nem apagado.
4. **Bibliotecas e licenças** (versões fixas, cópia em `vendor/` com a licença ao lado):
   - **LibRaw** (dupla licença, LGPL-2.1 ou CDDL-1.0) pelo `@colorhythm/libraw-wasm` 1.1.1 (MIT), só para abrir o
     arquivo do fabricante. O `.wasm` fica separado e substituível, sem alteração.
   - **MediaPipe** `@mediapipe/tasks-vision` 1.2.3 (Apache-2.0) para rosto, olhos, objetos e cena. Detecta, não
     identifica: agrupar por pessoa fica fora deste corte.
   - Preact e htm para as telas, sem build. Nenhum código GPL portado (nada de AMaZE, RawTherapee ou darktable).
5. **Motor próprio (Latitude), na luz da cena.** Linear, Rec.2020, cinza médio em 0,18, sem teto. As margens de altas
   luzes e de sombras são **medidas no arquivo** (preto, saturação efetiva e ruído do sensor), não presumidas pelo
   modelo da câmera. Os controles de luz valem em EV: o mesmo número dá o mesmo resultado em qualquer foto.
6. **Decupagem explicável (Magnitude).** Foco, borrão, exposição, olhos e repetidas viram uma nota que vem sempre com
   o motivo. Sinal que não foi medido não aparece; camada de visão que não carregou aparece como indisponível.
7. **Predefinições.** Formato próprio `.zropreset`; importação do Lightroom (`.xmp`, `.lrtemplate`) com relatório por
   chave: exato, aproximado ou ignorado, com a razão. Estilo extraído de uma foto sai como controles editáveis, com o
   erro medido.
8. **Galeria do cliente.** Link com token (o banco guarda só o sha256), PIN opcional, prévias reduzidas com
   marca-d'água; o original nunca sobe.
9. **Fechado pelo gate.** Migração `0065`: `coming_soon`, `development`, os cinco canais fechados, fora de todo plano,
   sem cliente OIDC. O site, quando existir, mostra só a página neutra para quem não tem a claim `zro_release.foto`.
   Ícone do HUB em `apps/hub-web/marca-fechada/foto.svg` (fora de `public/`).
10. **Símbolo (proposta):** o anel do O atravessado por um raio horizontal fino que sai um pouco para fora do traço,
    como as pontas da centelha. Uma cor, flat, azulejo grafite. Fonte única: `products/foto/scripts/marca.mjs`.

## Consequências

- Mais um app no catálogo (etapa 12), fechado. Para o público nada muda; a administração passa a vê-lo no HUB.
- Primeiro app do ecossistema com leitura de RAW e visão computacional no navegador: WASM e modelos pesados (dezenas
  de MB) servidos pelo próprio app, com cache; o aparelho da pessoa faz o trabalho, sem custo de servidor por foto.
- Obrigação de licença: manter os textos da LibRaw e do MediaPipe junto das cópias e registrar a versão e a origem.
- A galeria do cliente é o único ponto com armazenamento e custo: bucket privado, só de prévias.
- Rosto é dado sensível (LGPD): a detecção roda local e não guarda assinatura de rosto.

## Depende do titular

- **Nome**: confirmar LUXON (ou outro) e fazer a busca no INPI, classes 9 e 42. Nomes parecidos a conferir: LUXEON
  (Lumileds) e Luxion. O símbolo também é proposta.
- **Projeto Vercel e domínio** `<nome>.absolutezro.com` (ADR 0025), com Root Directory `products/foto`.
- **Cliente OIDC `foto-web`**, cadastrado no console (o segredo aparece uma vez e não entra em arquivo).
- **Schema `foto` no Supabase `AbsoluteZRO`** e o **bucket privado das prévias** da galeria.
- **Merge da migração `0065`**: o build da Vercel aplica em produção.
- **Lançamento**: migration nova abrindo o gate, com plano, limites por nível e preço.

## Fora deste corte

Máscaras e ajustes locais, correção de lente por perfil, agrupar por pessoa, HDR e panorama, tethering, app de
computador e cobrança de fotos extras.

## Como reverter

Enquanto for proposta e a `0065` não tiver sido aplicada, basta apagar esta ADR, a migração e a pasta. Depois de
aplicada, o produto sai do catálogo com migration nova (nunca editando uma aplicada).
