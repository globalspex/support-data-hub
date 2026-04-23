ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS airtable_record_id text;

CREATE INDEX IF NOT EXISTS idx_companies_airtable_record_id
  ON public.companies (airtable_record_id);

CREATE INDEX IF NOT EXISTS idx_companies_company_name_lower
  ON public.companies (lower(company_name));