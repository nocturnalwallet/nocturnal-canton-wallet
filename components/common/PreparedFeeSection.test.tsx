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
    expect(html).toContain('Estimate — may not be charged depending on network conditions.');
    expect(html).toContain('Wallet fee');
    expect(html).toContain('0.5 Amulet');
    expect(html).toContain('Network fee');
    expect(html).toContain('5.6291148501 Amulet');
    expect(html).toContain('Total estimated fee');
    expect(html).toContain('6.1291148501 Amulet');
    expect(html).not.toContain('party::abc');
  });

  it('does not render internal fee metadata as visible text', () => {
    const feeWithCostEstimation: FeeBlock = {
      ...sampleFee,
      costEstimation: {
        confirmationRequestBytes: 1024,
        confirmationResponseBytes: 512,
        rateUsdPerMb: '1.0',
        amuletPriceUsd: '0.5',
        trafficBufferBps: '100',
        networkFeeAmulet: '5.6291148501',
      },
    };
    const html = renderToStaticMarkup(
      createElement(PreparedFeeSection, { fee: feeWithCostEstimation }),
    );
    expect(html).toContain('Wallet fee');
    expect(html).toContain('0.5 Amulet');
    expect(html).not.toContain('confirmationRequestBytes');
    expect(html).not.toContain('rateUsdPerMb');
  });

  it('returns null when fees are empty and totalFee is blank', () => {
    const html = renderToStaticMarkup(
      createElement(PreparedFeeSection, {
        fee: { currency: 'Amulet', fees: [], totalFee: '' },
      }),
    );
    expect(html).toBe('');
  });

  it('returns null when fees are absent and totalFee is blank', () => {
    const html = renderToStaticMarkup(
      createElement(PreparedFeeSection, {
        fee: { currency: 'Amulet', fees: undefined as unknown as FeeBlock['fees'], totalFee: '' },
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
