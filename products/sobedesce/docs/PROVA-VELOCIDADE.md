# Prova medida: navegador × SOBEDESCE

Para a página e o anúncio: o **mesmo link**, baixado no navegador e no SOBEDESCE, com o **tempo real** de cada um.
Só vale número medido. Sem medição, a página não mostra número nenhum.

## Medir

1. Escolha um arquivo grande de verdade (um bruto de câmera de 5 a 20 GB), com o link aberto para "qualquer pessoa com
   o link".
2. No SOBEDESCE, baixe o arquivo pelo link, sem pausar. Deixe o app aberto.
3. Na mesma máquina e na mesma rede, logo depois:

   ```bash
   node scripts/prova-velocidade.mjs --link "<link>" --nome "<nome do arquivo>" --sobedesce "<arquivo que o app baixou>" --saida prova.json
   ```

   O script abre o link num Chromium de verdade (Playwright), clica em baixar (e em "Baixar assim mesmo", quando o Drive
   pede), espera o arquivo inteiro e mede. O tempo do SOBEDESCE vem da própria transferência do app
   (`startedAt` → `finishedAt`). O MD5 dos dois arquivos tem de bater; se não bater, a prova não vale.
4. Guarde o `prova.json` (data, máquina, tamanho, MD5, segundos e MB/s de cada lado). É a fonte de qualquer número
   publicado.

Se o Drive mudar a página e o clique automático falhar, meça o navegador à mão (cronômetro do clique até o fim) e
passe `--pular-navegador --navegador-segundos N --navegador-arquivo <caminho>`: o JSON registra "medido à mão".

## Vídeo 9:16 (15–20 s, tela real)

Gravação de tela das duas janelas lado a lado, na mesma rede, sem cortes no meio da contagem:

| Tempo | Tela | Texto na tela |
| --- | --- | --- |
| 0–2 s | As duas janelas paradas, o mesmo arquivo nas duas | "O mesmo arquivo. A mesma internet." |
| 2–12 s | Os dois começam juntos; acelerado só se a aceleração aparecer na tela ("8×") | Os tempos correndo nos dois lados |
| 12–16 s | O SOBEDESCE termina; o navegador ainda no meio | O tempo medido de cada um (do `prova.json`) |
| 16–20 s | Símbolo pequeno da Absolute ZRO e o nome do app | "SOBEDESCE" |

- Nada de cronômetro inventado: os números do fim saem do `prova.json`.
- Se for acelerado, diga quanto na tela.
