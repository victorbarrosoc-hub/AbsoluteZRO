> **Registro histórico.** Contém versões e configurações anteriores. O estado atual está em [homepage-performance.md](homepage-performance.md) e no [handoff](handoff/README.md). Não usar este arquivo como checklist operacional.

# Homepage: custo da onda e comparação de voz

## Atualização de 23/10: movimento fluido e candidato D

A implementação atual volta a desenhar ondas fluidas em canvas (11 linhas, 81 pontos, até 30 fps, DPR limitado a 1,5). Não altera paths SVG por frame nem dispara renderizações React continuamente. Pausa em aba oculta, fora da tela e com reduzir movimento. O SVG estático serve de alternativa acessível. Em Chromium 390×844/CPU 6×, uma amostra de seis segundos registrou 1,491 s de TaskDuration, 0,157 s de script e zero layouts/recalculos. O movimento custa mais que a versão estática abaixo, mas menos que a interpolação antiga de paths. Onda visível no rodapé continua animando; não se afirma custo zero após rolar. Não foi homologado em iPhone físico.

A demo atual usa 35 segundos da gravação real autorizada pelo titular, a partir de 30 s do original, e o candidato D escolhido por ele. O volume foi igualado com ganho estático; nenhum ruído foi acrescentado. A reconstrução pode alterar fonemas. O padrão remoto é Resemble Enhance lambda 0,5/tau 0,1, não motor Adobe. Endpoint/imagem/escala a zero ainda precisam de ativação e homologação reais na RunPod. As seções seguintes registram os resultados das versões anteriores.

A onda anterior interpolava o atributo `d` de 13 paths por instância em loops Motion. As três instâncias continuavam trabalhando fora do viewport. O card do hero aplicava backdrop blur sobre um SVG de fundo também animado.

A revisão mantém nove curvas estáticas por instância e anima somente o transform da superfície SVG. IntersectionObserver e visibilitychange pausam a animação fora da tela e com a aba oculta. Reduzir movimento desliga a animação. O fundo grande fica estático, o card não aplica backdrop blur e o cabeçalho móvel usa uma superfície opaca.

Medição local no mesmo build de produção, Chromium headless, viewport 390 × 844, CPU reduzida 6× pelo CDP. Depois de estabilizar a entrada, observaram-se 6 segundos. Não é uma medição em iPhone físico ou certificação de FPS.

| Métrica em 6 segundos |    Antes |   Depois |
| --------------------- | -------: | -------: |
| TaskDuration          | 4,6967 s | 0,0649 s |
| ScriptDuration        | 1,2082 s | 0,0022 s |
| LayoutCount           |      299 |        0 |
| RecalcStyleCount      |      299 |        5 |

Em 4 segundos adicionais depois de rolar ao fim: TaskDuration 3,6196 → 0,0123 s; ScriptDuration 0,9053 → 0. A onda do rodapé permanece visível nessa posição. Teste de navegador verifica ausência de mutações de `d`, pausa fora do viewport, aba oculta e reduzir movimento. Os números descrevem esta amostra; não garantem a mesma redução em todo dispositivo.

## Voz

O exemplo anterior combinava limpeza com Transmissão + Limite −3 dB e tinha quase 6 dB de diferença de loudness entre as versões. A comparação pública passa a usar a etapa Reduzir ruído automática, Natural 3, com volumes igualados depois do render. Os MP3 medidos têm −19,26 e −19,27 LUFS, duração 7,13 s e nenhum ganho de +6 dB ou compressão multibanda nesse exemplo. Créditos CC BY 4.0 preservados. Isso não altera a disponibilidade do preset de masterização de referência no estúdio.

Natural 3 mantém o DeepFilterNet3 existente. Ajusta o expoente dos ganhos vinculados para não reinserir tanto fundo nas regiões com fala: proteção da política anterior para gravações com piso abaixo de −50 dB ou separação de percentis de pelo menos 24 dB; a supressão extra cresce suavemente até 18 dB de separação, quando o fundo é significativo. Bypass de 0%, fase, relação estéreo, duração e versões continuam preservados. O controle não é uma nova rede treinada ou ressíntese generativa.

Na gravação humana pública com ruído rosa controlado usada para investigar a política, SI-SDR da entrada foi 12,44 dB; restauração Natural 2 isolada 16,05 dB; candidata Natural 3 isolada 17,05 dB. São erros de sinal contra uma referência conhecida, não avaliação auditiva nem equivalência ao Adobe. Não se compara SI-SDR da cadeia multibanda diretamente a esses valores, pois a resposta de fase dos crossovers altera a referência.

O limite de qualidade apontado pelo usuário continua relevante: DeepFilterNet3 com DSP local não reconstrói automaticamente fala severamente distorcida, reverberante ou saturada no padrão demonstrado pela referência Adobe Podcast v2. Uma integração futura de um modelo de restauração/reconstrução mais avançado precisa de execução e avaliação reais, infraestrutura de inferência e revisão do envio de áudio. Não há serviço de reconstrução em GPU configurado nesta revisão; não se alega ter integrado o motor proprietário Adobe. O repositório oficial Resemble Enhance descreve denoiser e enhancer generativo como uma opção de investigação, mas seus pesos hospedados no Hugging Face ficaram inacessíveis pelo proxy desta execução (HTTP 403), e ele não foi instalado, executado ou publicado como parte da plataforma.
