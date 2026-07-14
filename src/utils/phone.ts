const UZ_COUNTRY_CODE = '998';
const UZ_NATIONAL_LENGTH = 9;

/**
 * Returns the nine-digit Uzbek national number, or an empty string when the
 * input is incomplete / belongs to another country.
 */
export function getUzNationalDigits(raw: string | number | null | undefined): string {
  const digits = String(raw ?? '').replace(/\D/g, '');

  if (digits.length === UZ_NATIONAL_LENGTH) return digits;
  if (digits.length === UZ_NATIONAL_LENGTH + 1 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  if (digits.length === 12 && digits.startsWith(UZ_COUNTRY_CODE)) {
    return digits.slice(UZ_COUNTRY_CODE.length);
  }

  return '';
}

/** Canonical API/storage form used by the POS: digits-only 998XXXXXXXXX. */
export function normalizeUzPhone(raw: string | number | null | undefined): string {
  const national = getUzNationalDigits(raw);
  return national ? `${UZ_COUNTRY_CODE}${national}` : '';
}

export function formatUzPhone(raw: string | number | null | undefined): string {
  const national = getUzNationalDigits(raw);
  if (!national) return '';

  return `+998 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5, 7)} ${national.slice(7, 9)}`;
}
