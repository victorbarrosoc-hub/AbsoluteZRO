'use client'
/**
 * O Z na tela: anel e estrela cromados (public/ia/z) com o movimento de lib/ia/z/motor.ts. `ArZ` desenha o rastro e as
 * correntes atrás de um palco; o Z marcado com `vento` vira o centro delas. Nada é animado por render do React: o
 * motor mexe direto no estilo das peças.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArZ as MotorAr, type CenaZ } from '../../lib/ia/z/ar'
import { SimboloZ as MotorZ, type MovimentoZ } from '../../lib/ia/z/motor'

export type { CenaZ, MovimentoZ }

const Ar = createContext<MotorAr | null>(null)

export function Z({
  movimento,
  tamanho = 112,
  vento = false,
  desligada = false,
  className,
}: {
  movimento: MovimentoZ
  tamanho?: number
  /** Este Z é o centro do rastro e das correntes do PalcoZ em volta. */
  vento?: boolean
  desligada?: boolean
  className?: string
}) {
  const raiz = useRef<HTMLSpanElement>(null)
  const motor = useRef<MotorZ | null>(null)
  const ar = useContext(Ar)

  useEffect(() => {
    const z = new MotorZ(raiz.current!)
    motor.current = z
    return () => {
      z.destruir()
      motor.current = null
    }
  }, [])

  useEffect(() => motor.current?.mover(movimento), [movimento])

  useEffect(() => {
    if (!vento || !ar || !motor.current) return
    ar.alvo(motor.current)
    return () => ar.alvo(null)
  }, [vento, ar])

  return (
    <span
      className={`z-cena${className ? ` ${className}` : ''}`}
      style={{ ['--z-tam' as string]: `${tamanho}px` }}
      data-desligada={desligada ? '' : undefined}
      aria-hidden="true"
    >
      <span className="z" ref={raiz}>
        <img className="z__anel" src="/ia/z/anel.webp" alt="" draggable={false} />
        <span className="z__porta">
          <span className="z__estrela">
            <span className="z__halo" />
            <img src="/ia/z/estrela.webp" alt="" draggable={false} />
            <span className="z__reflexo" />
            <span className="z__raios" />
          </span>
        </span>
      </span>
    </span>
  )
}

/** Palco com o ar do Z por trás. `cena` diz a força das correntes. */
export function PalcoZ({ cena, className, children }: { cena: CenaZ; className?: string; children: ReactNode }) {
  const palco = useRef<HTMLDivElement>(null)
  const tela = useRef<HTMLCanvasElement>(null)
  const [ar, setAr] = useState<MotorAr | null>(null)

  useEffect(() => {
    const a = new MotorAr(palco.current!, tela.current!)
    setAr(a)
    return () => a.destruir()
  }, [])

  useEffect(() => ar?.mudar(cena), [ar, cena])

  return (
    <div className={`z-palco${className ? ` ${className}` : ''}`} ref={palco}>
      <canvas className="z-palco__ar" ref={tela} aria-hidden="true" />
      <Ar.Provider value={ar}>{children}</Ar.Provider>
    </div>
  )
}
