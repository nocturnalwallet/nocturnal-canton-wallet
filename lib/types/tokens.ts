import type { FC, SVGProps } from 'react';

export interface TokenType {
  id: string;
  symbol: string;
  chainID: string;
  chainName: string;
  decimal: number;
  icon: FC<SVGProps<SVGSVGElement>>;
  minAmount: string;
}

export interface InstrumentBalanceResponse {
  admin: string;
  id: 'Amulet' | 'CBTC' | 'USDCx';
}

export interface LockedDetails {
  amount: string;
  etaUnlockAt: string;
}

export interface TokenBalance {
  instrumentId: InstrumentBalanceResponse;
  locked: string;
  unlocked: string;
  lockedDetails: LockedDetails[];
}

