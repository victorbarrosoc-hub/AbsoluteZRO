import { toolSlugs } from './studio-routes';
const paths = new Set([
  '/studio',
  ...['projetos', 'ia', 'conta', 'planos', 'admin', ...Object.values(toolSlugs)].map(
    (slug) => `/studio/${slug}`,
  ),
]);

// Studio's shared layout already contains these screens. Native history integrates
// with Next's usePathname/useSearchParams without requesting the null route page.
// Initial entry, reloads and every data mutation still use server authentication.
export function visitStudio(href: string, replace = false): boolean {
  if (!paths.has(window.location.pathname)) return false;
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || !paths.has(url.pathname)) return false;
  const target = url.pathname + url.search + url.hash;
  if (target === location.pathname + location.search + location.hash) return true;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', target);
  return true;
}
