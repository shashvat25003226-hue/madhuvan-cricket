-- Madhuban Cricket: isolated app tables, no changes to unrelated Supabase tables.
-- All account and scoring database access is via the Node.js backend.
CREATE TABLE IF NOT EXISTS public.mc_players (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{24}$'),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mc_matches (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{24}$'),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mc_fixtures (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{24}$'),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mc_notifications (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{24}$'),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Email uniqueness is enforced by the database, including concurrent registrations.
CREATE UNIQUE INDEX IF NOT EXISTS mc_players_email_unique ON public.mc_players(lower(data->>'email'));
CREATE INDEX IF NOT EXISTS mc_matches_status_idx ON public.mc_matches ((data->>'status'));
CREATE INDEX IF NOT EXISTS mc_fixtures_date_idx ON public.mc_fixtures ((data->>'date'));
CREATE INDEX IF NOT EXISTS mc_notifications_player_idx ON public.mc_notifications ((data->>'playerId'));
-- PostgREST anon/authenticated clients cannot bypass server authorization.
ALTER TABLE public.mc_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mc_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mc_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mc_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mc_players,public.mc_matches,public.mc_fixtures,public.mc_notifications FROM anon,authenticated;