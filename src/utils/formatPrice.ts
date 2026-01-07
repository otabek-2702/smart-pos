export function formatPrice(value: number | string): string {
  const numberValue =
    typeof value === 'string'
      ? Number(value)
      : value

  if (!Number.isFinite(numberValue)) {
    return '0'
  }

  return numberValue
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}
