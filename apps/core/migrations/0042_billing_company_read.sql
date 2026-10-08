-- A company's billing manager may read the company's own issued invoices (Phase 3 item 0). Drafts are
-- WagonWise's working copy and stay hidden, and a company can never write to any of it.
create policy company_read_issued on billing.invoices for select
  using (company_id = public.rls_company_id() and status <> 'draft');

create policy company_read_issued on billing.invoice_lines for select
  using (
    invoice_id in (
      select i.id from billing.invoices i
      where i.company_id = public.rls_company_id() and i.status <> 'draft'
    )
  );
