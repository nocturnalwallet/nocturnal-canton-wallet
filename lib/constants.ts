export const TYPO_TEXT = `I accept full responsibility for my wallet keys and backups.`;

export const queryKey = {
  MARKET_QUOTE: 'MARKET_QUOTE',
  BALANCE: 'BALANCE',
  ABOUT_ME: 'ABOUT_ME',
  APPROVE_REQUESTS: 'APPROVE_REQUESTS',
  INCOMING_REQUESTS: 'INCOMING_REQUESTS',
  OUTGOING_REQUESTS: 'OUTGOING_REQUESTS',
  HISTORY_REQUESTS: 'HISTORY_REQUESTS',
} as const;

// Daml Decimal type = Numeric 10 → 10 digits after the decimal point
export const SUPPORTED_TOKENS = [
  {
    id: 'Amulet',
    symbol: 'CC',
    chainName: 'Canton Coin',
    decimal: 10,
    minAmount: '10',
  },
  {
    id: 'CBTC',
    symbol: 'CBTC',
    chainName: 'Canton Bitcoin',
    decimal: 10,
    minAmount: '0.00001',
  },
  {
    id: 'USDCx',
    symbol: 'USDCx',
    chainName: 'Canton USD Coin',
    decimal: 10,
    minAmount: '1',
  },
] as const;

export const AUTO_LOCK_MINUTES = Number(
  import.meta.env.VITE_AUTO_LOCK_MINUTES ?? '15',
);
