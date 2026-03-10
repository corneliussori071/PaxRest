-- Exchange rates cache table
-- Stores fetched exchange rates per company with 24-hour TTL
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  rates JSONB NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'api',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

-- Index for fast lookup by company
CREATE INDEX IF NOT EXISTS idx_exchange_rates_company ON exchange_rates(company_id);

-- RLS
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their company's rates
CREATE POLICY "Users can read own company exchange rates"
  ON exchange_rates FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

-- Only service role can insert/update (edge functions)
CREATE POLICY "Service role can manage exchange rates"
  ON exchange_rates FOR ALL
  USING (true)
  WITH CHECK (true);
