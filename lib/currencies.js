// Currencies on the board, in display order. GBP is the base, so it has no row.
export const CURRENCIES = [
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'Dh' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr.' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'QR' },
];

export const CODES = CURRENCIES.map((c) => c.code);

export const currencyName = (code) => CURRENCIES.find((c) => c.code === code)?.name ?? code;
