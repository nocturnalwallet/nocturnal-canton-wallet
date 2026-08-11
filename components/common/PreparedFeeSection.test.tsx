import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { FeeBlock } from '@lib/types';
import { PreparedFeeSection } from './PreparedFeeSection';

const sampleFee: FeeBlock = {
  currency: 'Amulet',
  totalFee: '6.1291148501',
  fees: [
    {
      description: 'Wallet fee',
      amount: '0.5',
      receiverPartyId: 'party::abc',
      type: null,
    },
    {
      description: 'Network fee',
      amount: '5.6291148501',
      receiverPartyId: 'party::abc',
      type: 'network',
    },
  ],
};

describe('PreparedFeeSection', () => {
  it('renders line items and total with currency', () => {
    const html = renderToStaticMarkup(
      createElement(PreparedFeeSection, { fee: sampleFee }),
    );
    expect(html).toContain('Estimated fee');
    expect(html).toContain('Wallet fee');
    expect(html).toContain('0.5 Amulet');
    expect(html).toContain('Network fee');
    expect(html).toContain('5.6291148501 Amulet');
    expect(html).toContain('Total');
    expect(html).toContain('6.1291148501 Amulet');
    expect(html).not.toContain('party::abc');
    expect(html).not.toContain('costEstimation');
  });

  it('returns null when fees are empty and totalFee is blank', () => {
    const html = renderToStaticMarkup(
      createElement(PreparedFeeSection, {
        fee: { currency: 'Amulet', fees: [], totalFee: '' },
      }),
    );
    expect(html).toBe('');
  });

  it('still shows total when fees array is empty but totalFee is set', () => {
    const html = renderToStaticMarkup(
      createElement(PreparedFeeSection, {
        fee: { currency: 'Amulet', fees: [], totalFee: '1.25' },
      }),
    );
    expect(html).toContain('Estimated fee');
    expect(html).toContain('1.25 Amulet');
  });
});
