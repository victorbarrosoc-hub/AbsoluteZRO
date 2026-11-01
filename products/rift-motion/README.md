# Rift Motion

Motion design 2D e 3D da Absolute ZRO. **Ainda não é app:** esta pasta guarda a marca em vetor e o protótipo de desenho,
no ar em **https://rift.absolutezro.com** (projeto Vercel `rift-motion`, Root Directory = esta pasta; autorizado pelo
titular em 01/11/2026). O build é `node publicar.mjs` (monta `publico/`); mudou o protótipo, o site muda junto.
Decisões em [ADR 0035](../../docs/decisions/0035-motion-2d-3d.md).

- `marca/`: o logo (RIFT, RIFT MOTION, o R), o ícone do app e o favicon, gerados por `marca/vetorizar.py` (a geometria
  mora só lá; rode `python3 marca/vetorizar.py` depois de mudar). PNG do ícone em 1024 e 180 px.
- `api/`: "Entrar com Absolute ZRO" (login único, cliente `rift-web`, cópia do Relay com cookies `rf_*`). Liga com
  `ZRO_CLIENT_ID` e `ZRO_CLIENT_SECRET` na Vercel; sem o segredo, o painel abre em demonstração e diz isso.
  `npm test` confere.
- Painel (`/#app`, `#projetos`, `#modelos`, `#biblioteca`, `#exportacoes`): projetos, biblioteca e exportações ficam no
  aparelho, por conta (localStorage), até o Rift ter banco; o estúdio abre cada projeto com a cena de exemplo.
- `prototipo.html`: o protótipo publicado como Artifact (página inicial, entrar e estúdio). Sem `<!doctype>` de
  propósito: o Artifact põe o esqueleto. Nada nele exporta, entra ou salva de verdade.

## Marca

| Peça           | Arquivo                                            | Uso                                          |
| -------------- | -------------------------------------------------- | -------------------------------------------- |
| RIFT MOTION    | `rift-motion-claro.svg` / `rift-motion-grafite.svg` | assinatura completa (claro no escuro, grafite no claro) |
| RIFT           | `rift-claro.svg` / `rift-grafite.svg`              | barra do app, cabeçalho                       |
| R              | `rift-r-claro.svg` / `rift-r-grafite.svg`          | símbolo solto                                 |
| Ícone do app   | `rift-icone.svg` (escuro), `rift-icone-claro.svg`  | Mac, Windows, grade do HUB, iPhone            |
| Favicon        | `favicon.svg`                                      | aba do navegador (sem a fenda, que some pequena) |

- Grade: letras com 100 de altura, barras de 22, hastes de 28, diagonais com a mesma inclinação (1,3 por 1). O F e o
  T dividem a barra de cima. A fenda (o "rift") corta o I numa curva e a perna do R na diagonal.
- Uma cor por versão: `#F5F5F7` no escuro, `#1D1D1F` no claro. O laranja entra só no ícone e na luz, nunca no texto.
- Paleta da arte: laranja `#EA6426`, areia `#E1CDBC`, lilás `#9A9CD0`, grafite `#29272A`, preto `#0B0B0C`.
- Leitura conferida a 60, 100 e 160 px (RIFT) e a 16, 24 e 32 px (favicon). Abaixo de ~60 px a fenda do I some e o
  nome continua legível.
- Falta: conferir no INPI (classes 9 e 42; "Rift" lembra o Oculus Rift da Meta) antes de registrar domínio e marca.
