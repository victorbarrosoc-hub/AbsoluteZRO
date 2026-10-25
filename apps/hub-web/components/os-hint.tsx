'use client'
/** Marca no <html> o sistema do visitante (mac, windows, mobile) para destacar o instalador certo. Só lê, não envia nada. */
import { useEffect } from 'react'

export function OsHint() {
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } }
    const ua = `${nav.userAgentData?.platform ?? ''} ${navigator.userAgent}`.toLowerCase()
    const mobile = nav.userAgentData?.mobile || /iphone|ipad|android|mobile/.test(ua) || (ua.includes('mac') && navigator.maxTouchPoints > 1)
    const os = mobile ? 'mobile' : ua.includes('mac') ? 'mac' : ua.includes('win') ? 'windows' : 'other'
    document.documentElement.dataset.os = os
  }, [])
  return null
}
