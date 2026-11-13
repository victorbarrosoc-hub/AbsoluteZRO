# ADR 0044 — ZERA: espaço em disco, mais rápido e seguro que o OmniDiskSweeper

**Status:** proposta (13/11/2026, pedido do titular: "estudar o OmniDiskSweeper, pesquisar os parecidos e melhorar a
ideia, mais eficiente e mais rápido"; nome ZERA escolhido pelo titular). Nasce **não lançado**: fora do catálogo e do
gate até o titular lançar.

## Contexto

O OmniDiskSweeper (Omni Group, grátis, só Mac) lista as pastas do disco do maior para o menor e manda para o Lixo. É
simples e confiável, mas:

- lê uma pasta por vez e varre tudo de novo a cada abertura;
- é só uma lista (sem visualização);
- não sabe o que é seguro tirar (o aviso de "arquivo do sistema" só vale para apps do instalador do macOS);
- pode contar errado no APFS (hard links, clones, arquivos só no iCloud).

Pesquisa (13/11/2026):

| Programa                               | O que faz melhor                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| WizTree (Windows)                      | lê o índice do NTFS (MFT) direto; o fabricante diz até 46× mais rápido que o WinDirStat |
| gdu, pdu, dust, dua (linha de comando) | leem várias pastas ao mesmo tempo                                                       |
| DaisyDisk, GrandPerspective (Mac)      | mapa visual (anéis, retângulos)                                                         |
| ncdu                                   | navegação rápida pelo teclado                                                           |

Nenhum sabe o que é cache de edição de vídeo, que é onde o público do ecossistema perde mais espaço (Media Cache do
Premiere, CacheClip do DaVinci, Render Files do Final Cut, prévias do Lightroom).

## Decisão

`products/zera/`: motor em Rust (`motor/`) + app para computador em Electron (`desktop/`), sem servidor, sem login,
sem rede.

- **Velocidade:** varredura paralela com roubo de trabalho (rayon), `lstat` relativo à pasta aberta, árvore em
  memória no motor (a tela só pede o que mostra), varredura guardada (abre na hora e confere por trás) e vigia do
  sistema (FSEvents/ReadDirectoryChanges) que faz revarrer só o trecho que mudou. Medido: ~3× mais rápido que o `du`
  com 4 núcleos (README).
- **Contar certo:** espaço ocupado (blocos), hard link uma vez, sem seguir atalhos, sem atravessar volumes; no Mac, o
  `/` junto com o volume Data, sem contar duas vezes; arquivo só na nuvem conta zero.
- **Saber o que tirar:** grupos com segurança explícita ("volta sozinho", "confira antes", "no Lixo") e repetidos
  conferidos byte a byte (tamanho → pontas → BLAKE3), mantendo o original e não a "cópia".
- **Nunca apagar:** a pessoa separa numa cesta, o app confere cada item (sistema, raiz do disco, pastas essenciais e o
  que está fora da varredura nunca saem), mostra a prévia e só então manda para o Lixo do sistema. A lista que vai
  para o Lixo é a conferida pelo app, com código de uso único. Coerente com a regra da raiz (prévia e confirmação
  explícita; o HUB não apaga mídia).
- **Padrão Apple do ecossistema:** claro por padrão, Figtree, vidro, uma ação principal por tela, anel que se desenha
  e se recolhe ao entrar nas pastas, tudo respeitando "reduzir movimento".

## Fora (por enquanto)

- Leitura direta da MFT no Windows e `getattrlistbulk` no Mac: ganho grande em disco cheio, mas pedem código por
  sistema (e a MFT pede administrador). Próximo passo se a varredura paralela não bastar.
- Detectar clones do APFS (`ATTR_CMNEXT_CLONEID`): hoje a tela só avisa.
- Integração com o HUB (Set, catálogo, central): quando o titular lançar.

## Lançar (com o titular)

1. Ícone do ZERA aprovado (regra da raiz: não inventar logo).
2. Migração nova: `zera` no catálogo e no gate (`zro.product_release`), canais `desktop`/`download`.
3. Central e downloads (`APPS_DESKTOP`/`DOWNLOADS`), Release de teste e espelho (ADR 0043) no workflow.
4. Domínio `zera.absolutezro.com` (ADR 0025) com a página do produto.
5. Assinatura da Apple e da Microsoft (o app pede "Acesso total ao disco" no Mac).
