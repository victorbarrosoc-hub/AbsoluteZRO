'use client';
import { useEffect } from 'react';
/** Keep keyboard focus within the active dialog and restore the trigger on close. */
export function useDialog(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const selector =
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]';
    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter(
        (element) => element.getClientRects().length > 0,
      );
    (dialog.querySelector<HTMLElement>('[autofocus]') ?? focusable()[0])?.focus();
    const inertNodes: { node: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement = (dialog.closest('.modal-backdrop') as HTMLElement) ?? dialog;
    while (branch.parentElement) {
      for (const node of branch.parentElement.children)
        if (node !== branch && node instanceof HTMLElement) {
          inertNodes.push({ node, inert: node.inert });
          node.inert = true;
        }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = focusable(),
        first = elements[0],
        last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', trap);
    return () => {
      document.body.style.overflow = oldOverflow;
      inertNodes.forEach(({ node, inert }) => {
        node.inert = inert;
      });
      dialog.removeEventListener('keydown', trap);
      if (previous?.isConnected && !previous.closest('[inert]')) previous.focus();
      else document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus();
    };
  }, [active]);
}
