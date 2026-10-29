/**
 * "Em desenvolvimento" (ADR 0023): o que a pessoa vê quando tenta entrar num app ainda fechado ao público. Padrão
 * Apple: o símbolo pequeno como assinatura, o ícone do app como protagonista, um título em Figtree Light × ExtraBold,
 * uma linha de apoio e uma ação só (voltar ao HUB). Nenhum dado interno: nem quem pode entrar, nem quando abre.
 * A mesma tela, em HTML estático, fica em docs/integration-contracts/em-desenvolvimento.html para os sites copiarem.
 */
import Link from 'next/link'
import { ProductMark, ZroSymbol } from '@zro/ui'

export type ProdutoFechado = { id: string; nome: string }

export function EmDesenvolvimento({ produto }: { produto: ProdutoFechado }) {
  return (
    <div className="emdev" data-produto={produto.id}>
      <ZroSymbol size={26} title="Absolute ZRO" className="emdev__marca" />
      <div className="emdev__app">
        <ProductMark productId={produto.id} name={produto.nome} size={76} />
        <p className="emdev__nome">{produto.nome}</p>
      </div>
      <h1 className="atitle emdev__titulo">
        <span className="atitle__thin">Em </span>
        <span className="atitle__bold">desenvolvimento.</span>
      </h1>
      <p className="emdev__apoio">Ainda não está aberto ao público. Quando abrir, você fica sabendo pelo HUB.</p>
      <Link className="glass-btn glass-btn--ink" href="/inicio">
        Voltar ao HUB
      </Link>
    </div>
  )
}
