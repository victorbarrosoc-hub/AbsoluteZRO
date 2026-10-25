'use client';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { visitStudio } from '@/lib/studio-navigation';

export default function StudioLink({
  href,
  onClick,
  ...props
}: Omit<ComponentProps<typeof Link>, 'href'> & { href: string }) {
  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (props.target && props.target !== '_self') ||
          props.download
        )
          return;
        if (visitStudio(href)) event.preventDefault();
      }}
    />
  );
}
