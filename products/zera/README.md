# ZERA

**Espaço livre, sem medo.** Mostra o que ocupa o disco e libera espaço com segurança, no Mac e no Windows. Nasceu do
estudo do OmniDiskSweeper e dos analisadores que vieram depois (ADR 0044): mais rápido, com mapa visual, e feito para
quem edita vídeo.

Não lançado: não aparece para ninguém até o titular lançar (veja `CLAUDE.md`).

## O que faz

- **Mapa do disco** em anéis: cada pasta do tamanho que ocupa, na cor do que tem dentro (vídeo, áudio, imagens,
  projetos, apps, outros). Passa o ponteiro para ver, clica para entrar, clica no centro para voltar. Lista ao lado,
  do maior para o menor, com teclado (↑ ↓, Enter, Espaço põe na cesta, Esc volta).
- **Limpar**: o que dá para tirar, em grupos, do que volta sozinho para o que pede conferência:
  - volta sozinho: caches de edição (Premiere, DaVinci, Final Cut, Lightroom, After Effects), caches de apps,
    dependências de código (`node_modules`, `DerivedData`);
  - confira antes: proxies e mídia otimizada, backups de iPhone/iPad, instaladores, downloads parados há 3 meses,
    arquivos de mais de 1 GB parados há 6 meses, **repetidos** (conferidos byte a byte);
  - no Lixo: quanto o Lixo guarda (esvaziar é com o sistema).
- **Cesta e revisão**: a pessoa separa o que quer tirar, revisa (o app confere cada item e mostra o total), e tudo vai
  para o **Lixo do sistema**. Nada é apagado de vez. Sistema, a raiz do disco e as pastas essenciais nunca saem.
  Item no iCloud/OneDrive/Dropbox avisa que sai da nuvem também.
- **Abre na hora**: a última varredura fica guardada; o mapa aparece logo e uma varredura nova confere por trás.
- **Acompanha o disco**: o vigia do sistema avisa o que mudou e só aquele trecho é varrido de novo.

## Por que é mais rápido

| | OmniDiskSweeper | ZERA |
| --- | --- | --- |
| Leitura | uma pasta por vez | todas as pastas em paralelo (roubo de trabalho, todos os núcleos) |
| Abrir de novo | varre tudo de novo | mostra a última na hora e confere por trás |
| Disco mudou | varre tudo de novo | revarre só a pasta que mudou |
| Tela | lista | anel interativo + lista; a tela só pede o que mostra |
| Tamanho | aparente | ocupado de verdade; hard link uma vez; nuvem conta zero |
| Volumes no Mac | — | `/` + volume Data, sem contar duas vezes |
| Repetidos | não tem | tamanho → pontas → conteúdo inteiro (BLAKE3), em paralelo |

Medido neste ambiente (Linux, 4 núcleos, 196 mil arquivos, 16 GB), média de 3 rodadas:

| | Cache do sistema vazio | Cache cheio |
| --- | --- | --- |
| `du -sx /` | 2,9 s | 0,47 s |
| `zera-motor`, 1 núcleo | 3,1 s | 0,53 s |
| **`zera-motor`, 4 núcleos** | **1,0 s** | **0,18 s** |

O total bate com o `du -sxB1` (diferença de 0,004%, de arquivos que mudaram entre as duas medidas).

## Como é feito

```
products/zera/
  motor/      Rust: varrer.rs (varredura), arvore.rs (árvore em memória, anel, trechos), sugestoes.rs (grupos),
              duplicados.rs, cache.rs (varredura guardada), main.rs (protocolo de linhas JSON)
  desktop/    Electron: desktop/main.cjs (janela, ponte, Lixo, vigia), regras.cjs (segurança, discos, vigia),
              motor.cjs (processo do motor), preload.cjs (window.zera), interface/ (HTML, CSS e JS sem framework)
```

O motor é um processo só, vivo enquanto o app está aberto, com a árvore na memória dele. A tela pede uma pasta
(`abrir`), três ou quatro anéis (`anel`), os grupos (`sugestoes`) ou os repetidos (`duplicados`); nunca a árvore
inteira. Ao mandar para o Lixo, o app avisa o motor (`remover`) e os totais de cima se corrigem pela diferença.

## Rodar e testar

```bash
cd products/zera/desktop
npm ci
npm run motor                 # compila o motor (cargo build --release)
npm run desktop               # abre o app
npm test                      # regras, motor de verdade e interface no Chromium (Playwright)
npm run smoke                 # no Linux sem tela: xvfb-run -a npx electron . --smoke --no-sandbox
npm run telas                 # telas em PNG (claro e escuro) com dados de mentira, em telas/
```

```bash
cd products/zera/motor
cargo test
cargo run --release -- varrer /caminho 4     # mede: bytes, arquivos, ms
```

Instaladores: `.github/workflows/zera-desktop.yml` pelo botão "Run workflow" (`.dmg` universal e `.exe`, como
artefato do Actions). Sem assinatura da Apple/Microsoft por enquanto.

## Limites conhecidos

- **Windows**: tamanho ocupado estimado pelo cluster de 4 KB (sem a API de tamanho comprimido); hard links contam
  mais de uma vez. Arquivos só na nuvem do OneDrive contam zero.
- **Mac**: clones do APFS (cópia do Finder) aparecem como repetidos, mas tirar um não libera espaço; a tela avisa. Sem
  "Acesso total ao disco", algumas pastas não abrem; a tela avisa e leva aos Ajustes.
- **Linux** (só para desenvolver): sem vigia (o recursivo do Linux abre um vigia por pasta).
- Revarrer um trecho conta de novo um hard link que também existe fora dele (raro).
