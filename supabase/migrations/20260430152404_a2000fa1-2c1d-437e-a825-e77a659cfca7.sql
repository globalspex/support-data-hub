ALTER TABLE public.integration_connections
  ADD COLUMN IF NOT EXISTS sync_window_days INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS history_imported_through TIMESTAMPTZ NULL;