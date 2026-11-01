/**
 * A porta fechada do login único (ADR 0023). Duas formas:
 * - App que existe para a pessoa, mas com o login fechado (`produto`): o ícone e o nome, "Em desenvolvimento".
 * - App que não existe para ela (não lançado, migração 0049; `produto` null): uma página neutra, sem marca, nome ou
 *   explicação do app (titular, 01/11/2026: app não lançado não aparece nem como "em desenvolvimento").
 * Padrão Apple: o símbolo pequeno como assinatura, um título em Figtree Light × ExtraBold, uma linha e uma ação só.
 */
import Link from 'next/link'
import { ProductMark, ZroSymbol } from '@zro/ui'

export type ProdutoFechado = { id: string; nome: string }

export function EmDesenvolvimento({ produto }: { produto: ProdutoFechado | null }) {
  if (!produto)
    return (
      <div className="emdev">
        <ZroSymbol size={26} title="Absolute ZRO" className="emdev__marca" />
        <h1 className="atitle emdev__titulo">
          <span className="atitle__thin">Página </span>
          <span className="atitle__bold">indisponível.</span>
        </h1>
        <p className="emdev__apoio">O que você procura não está aqui.</p>
        <Link className="glass-btn glass-btn--ink" href="/inicio">
          Ir para a Absolute ZRO
        </Link>
      </div>
    )
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
