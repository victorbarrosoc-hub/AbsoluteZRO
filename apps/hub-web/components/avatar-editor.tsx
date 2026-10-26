'use client'
/**
 * Escolher foto: o navegador recorta no centro e reduz para 256 px em WebP antes de enviar (a foto do celular nunca
 * sobe inteira). Sem JavaScript, o arquivo vai como está e o servidor recusa se passar de 300 KB.
 */
import { useActionState, useRef, useState, type ChangeEvent } from 'react'
import type { FormState } from './action-form'
import { initials } from './avatar'
import { Icon } from './icons'

const SIZE = 256

async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
  bitmap.close()
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.86))
  if (!blob) return file
  return new File([blob], 'foto.webp', { type: blob.type || 'image/webp' })
}

export function AvatarEditor({
  action,
  current,
  name,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  current: string | null
  name: string
}) {
  const [state, formAction] = useActionState(action, null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const small = await shrink(file)
      const dt = new DataTransfer()
      dt.items.add(small)
      e.target.files = dt.files
      setPreview(URL.createObjectURL(small))
      form.current?.requestSubmit()
    } catch {
      // Formato que o navegador não abre (ex.: HEIC em alguns aparelhos): envia como está e o servidor decide.
      form.current?.requestSubmit()
    } finally {
      setBusy(false)
    }
  }

  const src = preview ?? current
  return (
    <form ref={form} action={formAction} className="avatar-editor">
      <label className="avatar-editor__pick" title="Trocar foto">
        <span className="avatar avatar--xl">{src ? <img src={src} alt="" width={112} height={112} /> : initials(name)}</span>
        <span className="avatar-editor__badge" aria-hidden="true">
          <Icon name="camera" size={16} />
        </span>
        <span className="zro-sr-only">Trocar foto</span>
        <input ref={input} className="zro-sr-only" type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/*" onChange={pick} />
      </label>
      <noscript>
        <button type="submit" className="zro-btn zro-btn--small">
          Enviar foto
        </button>
      </noscript>
      <p className="avatar-editor__status" role="status" aria-live="polite">
        {busy ? 'Preparando…' : state?.error ? <span className="zro-field__error">{state.error}</span> : state?.ok}
      </p>
    </form>
  )
}
