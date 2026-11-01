# Lançamento em três fases: o que entra em cada uma

Decisão do titular (30/10/2026). Este documento só registra **o que cada fase terá**; preços, divulgação e estratégia
ficam fora do repositório (ele é público). O plano muda ao longo do caminho: **atualize este arquivo quando a fase mudar**.

**Como se abre uma fase:** o titular diz "libera fase 2" ou "libera fase 3". Quem trabalha no código então: (1) tira
do ar o que ainda não é da fase, guardando o código pronto, ou liga o que foi guardado; (2) atualiza homepages e site;
(3) publica as versões novas dos apps; (4) aplica as migrações da fase. Nada de interruptor visível para o usuário.

**Guilda (fase 2), como está no código (31/10/2026):** a guilda e o painel **Sede** (desenho aprovado, Gel magenta) estão
prontos no branch `fase2-guilda`, atrás de UMA constante, `FASE_LANCAMENTO` em `products/carro-do-freela/db/fase.js` (padrão 1:
`/api/zro/guildas`, `/api/zro/sede` e `/api/zro/sede-imagem` respondem 404 e nada aparece). "Libera fase 2" = trocar para 2
nesse arquivo e publicar o Carro (o build aplica as migrações `0004_guildas`, `0005_sede` e `0006_missoes` do banco do Carro; a
0006 também acrescenta a coluna `missao_id`, vazia, às propostas, e na fase 1 a marca é recusada como campo desconhecido). **Fundar é
pago e os lugares extras também**: os planos do HUB nascem em rascunho (`0043` +5 lugares, `0044` fundação e +15 lugares) e
só são aplicados/ativados quando o titular liberar a venda. Enquanto forem rascunho, ninguém funda guilda nova (a folha leva
o pedido à conta Absolute ZRO; nada é cobrado). A fundação é cobrança ÚNICA, que o catálogo do HUB ainda não tem
(`billing_interval` só mensal ou anual): vendê-la pede antes essa mudança no modelo de planos.

Hoje (30/10/2026) **tudo o que está abaixo, exceto a guilda e o aluguel, já está no ar**. A retirada do que for das fases 2 e 3
acontece no dia do lançamento da fase 1, a pedido do titular, e não antes.

## Fase 1 · Chegada

- Conta única Absolute ZRO e teste de 15 dias, cadastro simples (sem CPF nem CNPJ).
- **Maestro:** quadro (colunas próprias), aprovação do cliente por link, orçamento com contrato, equipe e diárias,
  calculadora de viagem, permissões por função, financeiro.
- **Relay**, **SOBEDESCE**, **Synquei**, **TPeasy**, **Set** (chat comum).
- **Carro do Freela** sem guilda e sem aluguel: perfil, agenda, achar por data e horário, propostas, jobs, feed, brechó
  (anúncio e "tenho interesse").
- Apps de computador e lojas de aplicativos.

## Fase 2 · Comunidade

- **Carro do Freela:** **guilda** com o painel **Sede**: recepção (brasão ou logo, nível, sequência, lugares, memória em
  pôsteres, chat ao vivo), **chat** (sala da guilda + canal por job, menção, reação, fixado, call sheet com confirmação e
  presença), **quadro** (aviso, vitória, vaga interna, foto do set), **placa** (XP só de evento real, com antifarra;
  credenciais; sequência), **memória** com os créditos de cada job, **personalizar** (cor da casa e logo, só o dono) e o
  **quadro de missões** (montar o job com gente da guilda: escolher, a folha do job, uma proposta por pessoa pela caixa de
  sempre, os cartazes a rodar/rodando/feito com quem vai, trocar quem não vai, o próximo job de cada membro).
  **Fundação paga** (R$ 189 uma vez, 15 lugares) e **lugares extras** (+5 R$ 14,90/mês, +15 R$ 34,90/mês). Regra: nível,
  XP, lugares e cor nunca mudam a ordem da busca.
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
