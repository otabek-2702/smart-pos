export function formatPrice(value: number | string, empty?: true): string {
  const numberValue = typeof value === 'string' ? Number(value) : value;

  if (!Number.isFinite(numberValue)) {
    return '0';
  }
  const final = numberValue.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  if (empty) {
    return +final ? final : '';
  }
  return final;
}
