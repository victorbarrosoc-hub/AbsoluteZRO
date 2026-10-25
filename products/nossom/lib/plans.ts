export type Plan = {
  id: 'free' | 'essential' | 'studio';
  name: string;
  monthly_seconds: number;
  price_cents: number;
};
export const initialPlans: Plan[] = [
  { id: 'free', name: 'Grátis', monthly_seconds: 300, price_cents: 0 },
  { id: 'essential', name: 'Essencial', monthly_seconds: 7200, price_cents: 3900 },
  { id: 'studio', name: 'Studio', monthly_seconds: 21600, price_cents: 9900 },
];
export function minutes(seconds: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(
    Math.max(0, seconds) / 60,
  );
}
export function allowance(seconds: number) {
  return seconds >= 3600 && seconds % 3600 === 0
    ? `${seconds / 3600} h`
    : `${minutes(seconds)} min`;
}
export function price(cents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
