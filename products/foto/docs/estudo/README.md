# Estudo: o que o mercado faz e o que decidimos

O titular pediu: estudar Lightroom, Aftershoot e tudo que as plataformas de edição de foto fazem, com e sem IA, unir o melhor e melhorar o que der. Este é o estudo, feito em 13/11/2026. O contrato que saiu dele está em [ARQUITETURA.md](../ARQUITETURA.md); a decisão, no [ADR 0044](../../../../docs/decisions/0044-plataforma-de-fotos.md).

Cada documento marca a confiança do que diz: **verificado** (fonte lida ou prova rodada), **de memória** ou **suposição**. Números não verificados não entram em contrato sem conferir.

## Índice

| Documento | O que tem |
| --- | --- |
| [lightroom-e-reveladores.md](lightroom-e-reveladores.md) | Inventário do Lightroom e dos concorrentes, reclamações, a matemática de darktable, RawTherapee e Capture One, 15 oportunidades |
| [decupagem.md](decupagem.md) | O que cada plataforma de decupagem faz, fluxo ideal, sinais e nota explicável, atalhos, 12 melhorias |
| [raw-e-motor.md](raw-e-motor.md) | Bibliotecas de RAW com números medidos, licenças, a conta do motor, faixa dinâmica e margem |
| [visao-no-aparelho.md](visao-no-aparelho.md) | Pilha de visão testada, armadilhas do MediaPipe, algoritmos clássicos com limiares, olho fechado, duplicatas, cena, nota, LGPD |
| [predefinicoes.md](predefinicoes.md) | Formatos (`.xmp`, `.lrtemplate`, `.dcp`, `.costyle`, `.cube`), tabela chave → controle, limites, aspectos legais |
| [cliente-e-estilo.md](cliente-e-estilo.md) | Galerias de seleção do cliente e extração de estilo de uma referência |
| [nome.md](nome.md) | Família de nomes, candidatos, conflitos, top 3, o que falta verificar |
| [o-que-ja-existia.md](o-que-ja-existia.md) | O que o ecossistema já tinha e serviu de referência |

## As 12 decisões que o estudo sustentou

1. **A foto não sai do aparelho**; só sobe a prévia reduzida com marca d'água de uma galeria publicada. → [cliente-e-estilo.md](cliente-e-estilo.md#a5-privacidade-onde-ficam-as-fotos)
2. **Ler RAW com LibRaw em WASM** (`@colorhythm/libraw-wasm` 1.1.1) mais leitor DNG próprio, sem código GPL. → [raw-e-motor.md](raw-e-motor.md#1-veredito)
3. **Decupar pela prévia embutida no RAW**, em segundo plano, com os atalhos do Lightroom. → [decupagem.md](decupagem.md#3-fluxo-ideal-de-decupagem-rápida)
4. **Motor linear, sem teto, com um mapa de tons só, no fim**, e a luz em EV em torno do cinza: mesmo número, mesmo resultado. → [lightroom-e-reveladores.md](lightroom-e-reveladores.md#4-o-que-darktable-rawtherapee-e-capture-one-fazem-melhor-na-matemática)
5. **Medir a margem do arquivo no dado do sensor** (preto, saturação efetiva, ruído) e mostrar em stops. → [raw-e-motor.md](raw-e-motor.md#58-faixa-dinâmica-utilizável-e-margem-de-exposição)
6. **Estourada só reprova quando o sensor perdeu o dado**; o que o motor recupera fica. → [decupagem.md](decupagem.md#6-as-12-melhorias-sobre-o-que-existe)
7. **Nota sempre com motivo, teto e confiança**; empate aparece como empate. → [visao-no-aparelho.md](visao-no-aparelho.md#9-nota-de-0-a-100-explicável-e-estrelas)
8. **Visão em camadas opcionais, servidas do próprio domínio**; sem a camada, a nota sai só do que foi medido. → [visao-no-aparelho.md](visao-no-aparelho.md#11-pilha-final)
9. **Rosto é dado sensível**: detectar roda local; agrupar por pessoa fica fora deste corte. → [visao-no-aparelho.md](visao-no-aparelho.md#10-lgpd-precisa-de-revisão-jurídica)
10. **Importar preset do Lightroom com relatório por chave** (exato, aproximado, ignorado), sem prometer resultado idêntico. → [predefinicoes.md](predefinicoes.md#8-tabela-chave-crs--nosso-controle--fórmula-sugerida)
11. **Estilo de uma referência vira controles editáveis**, com erro medido, prometido como ponto de partida. → [cliente-e-estilo.md](cliente-e-estilo.md#b6-limites-honestos)
12. **Seleção do cliente no mesmo app**: link com token (só o hash no banco), PIN e porta estreita, no desenho do Maestro. → [o-que-ja-existia.md](o-que-ja-existia.md#5-links-públicos-e-tokens-de-compartilhamento)

O nome do produto é provisório e depende do titular e da busca de marca: ver [nome.md](nome.md).
