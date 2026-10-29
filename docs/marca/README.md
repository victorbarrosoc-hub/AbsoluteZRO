# Manual da marca Absolute ZRO

Versão de 26/10/2026, aprovada pelo titular ([ADR 0017](../decisions/0017-marca-flat-centelha.md)).

## A marca

**ABSOLUTE ZRO** com o O desenhado como **anel com centelha**: um anel de traço firme e, na borda direita, uma estrela
de 4 pontas centrada no traço. As letras são as do wordmark original, vetorizadas; só o O mudou.

| Peça                       | Arquivo (em `apps/hub-web/public/brand/`)                                        |
| -------------------------- | -------------------------------------------------------------------------------- |
| Wordmark (segue a cor)     | `absolute-zro.svg` · grafite: `absolute-zro-grafite.svg` · branco: `-branco.svg` |
| Símbolo (segue a cor)      | `absolute-zro-simbolo.svg` · `-simbolo-grafite.svg` · `-simbolo-branco.svg`      |
| Componentes React          | `ZroWordmark` e `ZroSymbol` em `@zro/ui` (desenho em `packages/ui/src/marca.ts`) |
| Ícones (site, iPhone, Mac) | `scripts/marca/icones.py` → `out/claro` e `out/escuro`                           |
| Fonte da geometria         | `scripts/marca/vetor/vetorizar.py` (gera os SVG e o `marca.ts`; não edite à mão) |

## Duas formas da mesma marca

### Flat: em qualquer lugar

É a forma de uso diário: site, HUB, apps, ícones, favicon, papelaria, bordado, placa, impressão em uma cor.

- A estrela fica **por trás do traço do anel**: as pontas de cima e de baixo somem dentro do traço e só aparecem as
  **pontas horizontais**, uma para dentro e outra para fora do anel.
- **Uma cor só.** Grafite `#1d1d1f` no claro, branco no escuro. Sem degradê, sem brilho, sem sombra na marca.
- Abaixo de **20 px** (favicon de 16 px) fica **só o anel**, com traço reforçado; a centelha não lê nesse tamanho.
- Área de respiro: no mínimo a altura do traço do anel em volta de toda a marca.
- Tamanho mínimo do wordmark: 96 px de largura na tela, 25 mm impresso.

### Animação: a estrela inteira

Em movimento (abertura de vídeo, carregamento, vinheta, entrada do site), **a centelha aparece com as 4 pontas**.

- A animação de referência: a estrela **nasce inteira** na borda do anel (pontas verticais à mostra) e **recolhe as
  pontas verticais para trás do traço**, terminando exatamente na forma flat. Nunca termina com as 4 pontas à mostra.
- No HUB: `<ZroSymbol animated />` (CSS em `packages/ui/src/components.css`, 1,6 s). Com "reduzir movimento", a
  marca já aparece flat.
- Em peças de luz (key visual, vinheta escura), o anel pode virar luz e a estrela pode brilhar. Fora da animação, a
  forma volta a ser flat.

## Não fazer

- Não mostrar as 4 pontas na marca parada (só na animação).
- Não usar o antigo "feixe de luz" (anel em degradê com brilho) como logo. As fotos de campanha antigas também saíram.
- Não colorir a marca em azul ou degradê; não aplicar efeito de vidro, sombra ou contorno na marca.
- Não distorcer, girar, separar o anel da centelha, nem trocar a fonte do wordmark.
- Não usar a marca menor que o mínimo; abaixo de 20 px, só o anel.

## Branding (Higgsfield, 26/10/2026)

Peças geradas a partir da marca flat (e da estrela inteira, nas peças de luz) para campanha e aplicação. Ficam em
`docs/marca/branding/` e servem de referência de aplicação; não são logo.

| Peça                            | Forma           | Uso                                              |
| ------------------------------- | --------------- | ------------------------------------------------ |
| `animacao-marca.mp4` (5 s, 1:1) | animação → flat | vinheta, abertura de vídeo, carregamento         |
| `luz-escuro.webp` (16:9)        | estrela inteira | key visual escuro, fundo de evento, capa         |
| `social-vertical.webp` (9:16)   | estrela inteira | story e Reels, espaço embaixo para o texto       |
| `escultura-claro.webp` (16:9)   | flat            | key visual claro (padrão do site)                |
| `papelaria.webp` (3:2)          | flat            | cartão: relevo seco no branco, branco no grafite |
| `bone.webp` (4:5)               | flat            | bordado em uma cor                               |
| `placa.webp` (4:5)              | flat            | sinalização em metal recortado                   |
