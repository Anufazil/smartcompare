export const rupees = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
export function etaLabel(minutes: number | undefined) {
  return minutes === undefined
    ? 'ETA unavailable'
    : minutes >= 1440
      ? `${Math.ceil(minutes / 1440)} day${minutes > 1440 ? 's' : ''}`
      : `${minutes} min`;
}
