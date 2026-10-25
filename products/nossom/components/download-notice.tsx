'use client';
import { useEffect, useState } from 'react';
/** Aviso quando /baixar/<sistema> não achou o instalador (volta para /apps?baixar=indisponivel). */
export default function DownloadNotice() {
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    setUnavailable(new URLSearchParams(window.location.search).get('baixar') === 'indisponivel');
  }, []);
  if (!unavailable) return null;
  return (
    <p className="apps-note" role="status">
      O download não saiu agora. Tente de novo em alguns minutos ou use o NOSSOM pelo navegador.
    </p>
  );
}
