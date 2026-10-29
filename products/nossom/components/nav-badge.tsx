import { badgeAria, badgeLabel } from '@/lib/studio-pending';

// Balão de pendências (lib/studio-pending.ts): pílula com o número em negrito tabular. `corner` põe no canto do
// ícone (barra do celular e botão do menu recolhido). A entrada é só CSS e para com "reduzir movimento".
export default function NavBadge({ count, corner = false }: { count: number; corner?: boolean }) {
  if (!count) return null;
  return (
    <span
      className={`nav-badge${corner ? ' nav-badge--corner' : ''}`}
      role="img"
      aria-label={badgeAria(count)}
    >
      {badgeLabel(count)}
    </span>
  );
}
