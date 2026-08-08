import { describe, it, expect } from 'vitest';
import { median, buildFactSheet, renderReportHtml, maskEmail, sanitizeForModel, type MetricRow } from '../../api/benchmark-report';
import { mapAuto } from '../../pages/Report';
import { mapTechFTE, median as clientMedian } from '../../pages/Report.helpers';

const sub = (o: Record<string, unknown> = {}) => ({
  respondentRole: 'tax_professionals', revenueRange: '100m_500m', jurisdictionsCovered: 4,
  taxCalculationAutomationRange: '70_90', aiAdopted: false, ...o,
}) as any;

describe('parity with the client Report helpers (drift guard)', () => {
  // The serverless function can't import client code (no-imports-outside-/api),
  // so the enum→number maps are inlined — these tests keep both sides honest.
  it('automation map matches pages/Report mapAuto for every key', () => {
    for (const k of ['99_plus', '90_99', '70_90', '40_70', 'under_40']) {
      const fs = buildFactSheet(sub({ taxCalculationAutomationRange: k }), [sub({ taxCalculationAutomationRange: k })]);
      // peer median for a single peer with value k must equal mapAuto(k)
      expect(fs.metrics[0].peerMedian).toBe(`~${mapAuto(k)}%`);
    }
  });

  it('tech-FTE map matches pages/Report.helpers mapTechFTE for every key', () => {
    for (const k of ['zero', '1_5', '6_15', '16_30', '31_100', 'over_100']) {
      const fs = buildFactSheet(sub(), [sub({ taxTechFTEsRange: k })]);
      const row = fs.metrics.find(m => m.label.includes('FTEs'))!;
      if (k === 'zero') expect(row.peerMedian).toBe('no data yet'); // median 0 renders as no-data
      else expect(row.peerMedian).toBe(`~${Math.round(mapTechFTE(k))}`);
    }
  });

  it('median matches the client median for odd/even/empty', () => {
    for (const arr of [[], [5], [1, 9], [3, 1, 7], [10, 2, 8, 4]]) {
      expect(median(arr)).toBe(clientMedian(arr));
    }
  });
});

describe('buildFactSheet (deterministic medians — the model never computes)', () => {
  it('positions the member against the peer MEDIAN, outlier-resistant', () => {
    const peers = [
      sub({ taxCalculationAutomationRange: 'under_40' }),  // 20
      sub({ taxCalculationAutomationRange: 'under_40' }),  // 20
      sub({ taxCalculationAutomationRange: '99_plus' }),   // 99.5 outlier
    ];
    const fs = buildFactSheet(sub({ taxCalculationAutomationRange: '70_90' }), peers); // mine: 80
    const row = fs.metrics[0];
    expect(row.peerMedian).toBe('~20%');       // median holds at typical peer
    expect(row.position).toBe('above');        // 80 > 20 (a mean would've said ~46.5)
  });

  it('missing answers are "not provided" with position n/a — never a fake zero', () => {
    const fs = buildFactSheet(sub({ taxPaymentAutomationRange: undefined }), [sub({ taxPaymentAutomationRange: '90_99' })]);
    const row = fs.metrics[1];
    expect(row.yours).toBe('not provided');
    expect(row.position).toBe('n/a');
  });

  it('peers without an answer are excluded from that metric median (not counted as 0)', () => {
    const peers = [sub({ taxCalculationAutomationRange: '90_99' }), sub({ taxCalculationAutomationRange: undefined })];
    const fs = buildFactSheet(sub(), peers);
    expect(fs.metrics[0].peerMedian).toBe('~95%'); // the unanswered peer didn't drag it to 47.5
  });

  it('GenAI adoption compares against the cohort share', () => {
    const peers = [sub({ aiAdopted: true }), sub({ aiAdopted: false }), sub({ aiAdopted: false }), sub({ aiAdopted: false })];
    const fs = buildFactSheet(sub({ aiAdopted: true, genAIAdoptionStage: 'poc' }), peers);
    const row = fs.metrics.find(m => m.label === 'GenAI adoption')!;
    expect(fs.aiAdoptionPct).toBe(25);
    expect(row.yours).toContain('adopted');
    expect(row.position).toBe('above'); // adopted while a minority of peers have
  });
});

describe('renderReportHtml', () => {
  const metrics: MetricRow[] = [
    { label: 'Tax calculation automation', yours: '~70–90%', peerMedian: '~80%', position: 'at' },
  ];
  const html = renderReportHtml({
    name: 'Jane', role: 'Tax professional',
    headline: 'You lead on automation', summary: 'Two paragraphs.',
    strengths: ['Automation above median'], gaps: [], recommendations: ['Look at e-invoicing'],
    metrics, cohortSize: 12, generatedAt: '2026-08-02', siteUrl: 'https://taxbenchmark.ai',
  });

  it('contains the fact table, provenance line, and the LLC operator line', () => {
    expect(html).toContain('Peer median');
    expect(html).toContain('12 anonymized member submissions');
    expect(html).toContain('Medians, not averages');
    expect(html).toContain('Seven Twenty Two LLC');
    expect(html).toContain('refresh your benchmark');
  });

  it('escapes HTML in model-authored fields (no injection into the email)', () => {
    const dirty = renderReportHtml({
      name: 'Jane', role: 'Member',
      headline: '<script>alert(1)</script>', summary: 'ok', strengths: [], gaps: [],
      recommendations: ['<img src=x onerror=alert(1)>'],
      metrics, cohortSize: 1, generatedAt: '2026-08-02', siteUrl: 'https://taxbenchmark.ai',
    });
    expect(dirty).not.toContain('<script>');
    expect(dirty).not.toContain('<img src=x');
    expect(dirty).toContain('&lt;script&gt;');
  });

  it('omits empty sections instead of rendering empty headers', () => {
    expect(html).not.toContain('Where you trail');
    expect(html).toContain('Where you lead');
  });
});

describe('maskEmail / sanitizeForModel', () => {
  it('masks the local part, keeps the domain recognizable', () => {
    expect(maskEmail('jiyangu923@gmail.com')).toBe('ji***@gmail.com');
    expect(maskEmail('nodomain')).toBe('***');
  });

  it('PRIVACY: identity fields never reach the narrative model', () => {
    const clean = sanitizeForModel({ companyName: 'SecretCo', userName: 'Jane Real', id: 'x', userId: 'y', revenueRange: '100m_500m' });
    expect(clean).toEqual({ revenueRange: '100m_500m' });
  });
});
