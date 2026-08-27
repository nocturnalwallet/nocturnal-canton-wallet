export const TYPO_TEXT = `I accept full responsibility for my wallet keys and backups.`;

export const queryKey = {
  MARKET_QUOTE: 'MARKET_QUOTE',
  BALANCE: 'BALANCE',
  ABOUT_ME: 'ABOUT_ME',
  APPROVE_REQUESTS: 'APPROVE_REQUESTS',
  INCOMING_REQUESTS: 'INCOMING_REQUESTS',
  OUTGOING_REQUESTS: 'OUTGOING_REQUESTS',
  HISTORY_REQUESTS: 'HISTORY_REQUESTS',
  ELFA_TRENDING_TOKENS: 'ELFA_TRENDING_TOKENS',
  ELFA_TOKEN_NEWS: 'ELFA_TOKEN_NEWS',
  ELFA_NARRATIVES: 'ELFA_NARRATIVES',
  ELFA_TOP_MENTIONS: 'ELFA_TOP_MENTIONS',
  ELFA_KEYWORD_MENTIONS: 'ELFA_KEYWORD_MENTIONS',
  ELFA_SMART_STATS: 'ELFA_SMART_STATS',
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

/**
 * User-facing display name for an on-ledger instrument id. The id stays as-is on
 * the ledger/API (e.g. 'Amulet'); we only rename the label the user sees
 * ('Amulet' -> 'Canton Coin'). Falls back to the id for unknown instruments.
 */
export function tokenDisplayName(instrumentId: string): string {
  return SUPPORTED_TOKENS.find((t) => t.id === instrumentId)?.chainName ?? instrumentId;
}

/** Short symbol for an instrument id (e.g. 'Amulet' -> 'CC'), for amount/unit labels. */
export function tokenSymbol(instrumentId: string): string {
  return SUPPORTED_TOKENS.find((t) => t.id === instrumentId)?.symbol ?? instrumentId;
}

export const AUTO_LOCK_MINUTES = Number(
  import.meta.env.VITE_AUTO_LOCK_MINUTES ?? '15',
);
