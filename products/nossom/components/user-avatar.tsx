'use client';
import { useState } from 'react';
import type { Account } from '@/lib/accounts';
/**
 * Perfil único: a foto da conta Absolute ZRO quando a conta está ligada e tem foto; senão a foto
 * enviada no NOSSOM; senão a inicial. Foto que não carrega cai para a próxima.
 */
export default function UserAvatar({
  account,
  className,
}: {
  account: Pick<Account, 'name' | 'avatar' | 'zro'>;
  className: string;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const photo = [
    account.zro?.picture,
    account.avatar ? `/api/account/avatar?v=${account.avatar}` : undefined,
  ].find((src): src is string => !!src && !failed.includes(src));
  return (
    <span className={`${className} ${photo ? 'has-photo' : ''}`}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photo}
          src={photo}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed((list) => [...list, photo])}
        />
      ) : (
        account.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
/** Square-crops and shrinks a picked image in the browser before it is uploaded. */
export async function avatarFromFile(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha uma imagem.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Essa imagem é muito grande.');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Não foi possível abrir essa imagem. Tente uma foto JPG ou PNG.');
  });
  const side = Math.min(bitmap.width, bitmap.height),
    size = 256,
    canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();
  const encode = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // WebP when the browser can encode it, JPEG otherwise; both stay well under the limit.
  const webp = await encode('image/webp', 0.86);
  const blob = webp?.type === 'image/webp' ? webp : await encode('image/jpeg', 0.88);
  if (!blob) throw new Error('Não foi possível preparar a foto.');
  return blob;
}
