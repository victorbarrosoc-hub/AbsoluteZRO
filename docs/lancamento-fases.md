# Lançamento em três fases: o que entra em cada uma

Decisão do titular (30/10/2026). Este documento só registra **o que cada fase terá**; preços, divulgação e estratégia
ficam fora do repositório (ele é público). O plano muda ao longo do caminho: **atualize este arquivo quando a fase mudar**.

**Como se abre uma fase:** o titular diz "libera fase 2" ou "libera fase 3". Quem trabalha no código então: (1) tira
do ar o que ainda não é da fase, guardando o código pronto, ou liga o que foi guardado; (2) atualiza homepages e site;
(3) publica as versões novas dos apps; (4) aplica as migrações da fase. Nada de interruptor visível para o usuário.

**Guilda na fase 1, GRÁTIS (decisão do titular, 01/11/2026):** a guilda inteira (criar, entrar, convidar, Sede, chat,
mural, memória, XP, cor/logo, quadro de missões e a marca de guilda nas propostas) entra na fase 1. O portão é
`products/carro-do-freela/db/fase.js`, agora com **recursos por fase**: `guilda: 1` e `venda_guilda: null` (sem fase). Na
publicação do Carro o build aplica as migrações do banco do Carro `0004_guildas`, `0005_sede`, `0006_missoes` e
`0007_disponibilidade`. Criar guilda não cobra nada e vem com **15 lugares** (+2 no nível 10, grátis). **Nada é vendido**:
fundação paga (R$ 189), pacotes de lugares (+5, +15) e qualquer "espaço extra" pago ficam escondidos na tela e recusados no
servidor (403 `sem_venda`; os sinais de pacote da conta são ignorados). A venda volta quando a cobrança for ligada: pôr
`venda_guilda` numa fase e aplicar os planos guardados em [carro-guilda-venda-rascunho.md](carro-guilda-venda-rascunho.md)
(a fundação é cobrança ÚNICA, que o catálogo do HUB ainda não tem: pede antes uma ADR).

Hoje (30/10/2026) **tudo o que está abaixo, exceto a guilda e o aluguel, já está no ar** (a guilda entra com a publicação
do branch `guilda-fase1`). A retirada do que for das fases 2 e 3
acontece no dia do lançamento da fase 1, a pedido do titular, e não antes.

## Fase 1 · Chegada

- Conta única Absolute ZRO e teste de 15 dias, cadastro simples (sem CPF nem CNPJ).
- **Maestro:** quadro (colunas próprias), aprovação do cliente por link, orçamento com contrato, equipe e diárias,
  calculadora de viagem, permissões por função, financeiro.
- **Relay**, **SOBEDESCE**, **Synquei**, **TPeasy**, **Set** (chat comum).
- **Carro do Freela** sem aluguel: perfil, agenda, achar por data e horário, propostas, jobs, feed, brechó (anúncio e
  "tenho interesse") e a **guilda, grátis** (01/11/2026): painel **Sede** com recepção, chat, quadro, placa (XP), memória,
  personalizar (cor e logo) e o **quadro de missões** (montar o job com gente da guilda: a data e o horário primeiro, só quem
  está livre naquele horário). 15 lugares, +2 no nível 10. Nível, XP, lugares e cor nunca mudam a ordem da busca.
- Apps de computador e lojas de aplicativos.

## Fase 2 · Comunidade

- **Carro do Freela:** a guilda já está na fase 1 (grátis). A **venda** da guilda (fundação paga, lugares extras) só
  quando a cobrança for ligada, por decisão do titular.
- **Maestro:** freela convidado pelo @, "Seus trabalhos" (área do freela), capas no quadro.
- **Set:** sugestões ao digitar o @.
- App de computador do Carro do Freela.

## Fase 3 · Do roteiro ao ar

- **Maestro:** Criação (roteiro literário e técnico, teleprompter, fluxo, aprovação do roteiro pelo cliente), roteiro
  direto para o TPeasy, Arquivos (SOBEDESCE embutido), Gerar versões com o Relay (SOBEDESCE 0.2.0), marca própria.
- **Relay:** Escolher no Drive.
- **Carro do Freela:** **aluguel no brechó**.
- **Z** (assistente com voz), **só no plano Pro**.

## Fora das fases (decisão do titular)

- Sem assinatura gov.br e sem contrato no Carro do Freela (travam as transações).
- AEON, Revela e NOSSOM entram depois, um por vez, quando estiverem prontos.
