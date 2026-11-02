# Planos por fase (documento interno)

Mapa do titular para planejar os lançamentos. **Nada daqui aparece para quem vê os planos**: nenhuma tela pública ou
do usuário fala em "fase", "em breve" ou no roteiro de novidades. Para a pessoa, o teste aparece só como
"Absoluto · teste até DD/MM". O que cada fase traz em cada app está em [lancamento-fases.md](lancamento-fases.md).
Modelo e contrato: [ADR 0039](decisions/0039-planos-zero-orbita-absoluto.md).

## Fase 1 — Chegada

- Planos Zero, Órbita, Absoluto e Avulso (preços na ADR 0039), sem cobrança online até o Stripe.
- Teste de 15 dias do Absoluto como campanha: ligado pelo titular no console (/admin/planos) quando der o sinal de
  lançamento (e-mails e tráfego pago), com data de fim. Desligado até lá.
- A Z bem limitada no teste: 50 mensagens no período. Zero 10/mês, Órbita 100, Absoluto 300, Avulso 50.
- Contas antigas seguem com o que tinham; passar para o Zero só quando o titular decidir (console, desligado).

## Depois

- Assinatura online (Stripe), recargas da Z à venda e voz da Z no Absoluto quando existir.
- Os números do catálogo mudam no console (Limites por nível), sem migração.
