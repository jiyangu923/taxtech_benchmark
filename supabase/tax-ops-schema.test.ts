import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const foundation = readFileSync('supabase/add_tax_ops_foundation.sql', 'utf8');
const workpapers = readFileSync('supabase/add_tax_ops_workpapers.sql', 'utf8');

describe('tax operations schema contracts', () => {
  it('preserves every source transaction for grouped reconciliation items', () => {
    expect(foundation).toContain('create table if not exists public.tax_ops_reconciliation_item_transactions');
    expect(foundation).toContain('foreign key (reconciliation_item_id, organization_id)');
    expect(foundation).toContain('foreign key (transaction_id, organization_id)');
    expect(foundation).toContain('alter table public.tax_ops_reconciliation_item_transactions enable row level security');
    expect(foundation).toContain('Tax ops members read reconciliation transaction links');
    expect(foundation).toContain('grant select on public.tax_ops_reconciliation_item_transactions to authenticated');
  });

  it('validates each rule-reference element instead of accepting any nonempty JSON array', () => {
    expect(workpapers).toContain('create or replace function public.tax_ops_rule_references_are_valid');
    expect(workpapers).toContain("rule_reference ?& array['ruleId', 'version', 'sourceUrl', 'effectiveFrom', 'lastVerified']");
    expect(workpapers).toContain("(rule_reference ->> 'sourceUrl') !~ '^https://[^[:space:]]+$'");
    expect(workpapers).toContain('check (public.tax_ops_rule_references_are_valid(rule_references))');
  });

  it('couples approved workpaper state to a named approval decision', () => {
    expect(workpapers).toContain('create or replace function public.approve_tax_ops_workpaper');
    expect(workpapers).toContain('create trigger tax_ops_workpaper_approval_guard');
    expect(workpapers).toContain('Approved or exported workpapers require a named approved decision');
    expect(workpapers).toContain("member.role in ('owner', 'admin', 'reviewer')");
    expect(workpapers).toContain("status in ('approved', 'exported') and approved_at is not null");
  });

  it('uses transactional scripts, pinned function lookup, and explicit least privilege', () => {
    for (const migration of [foundation, workpapers]) {
      expect(migration.trimStart().split('\n')).toContain('begin;');
      expect(migration.trimEnd().endsWith('commit;')).toBe(true);
      expect(migration).not.toContain('set search_path = public');
    }
    expect(foundation).toContain('revoke all on public.tax_ops_transactions from authenticated');
    expect(workpapers).toContain('revoke all on public.tax_ops_filing_workpapers from authenticated');
  });
});
