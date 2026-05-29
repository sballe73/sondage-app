CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  visibility TEXT NOT NULL,
  group_id TEXT,
  voter_mode TEXT NOT NULL,
  grade_min INTEGER NOT NULL,
  grade_max INTEGER NOT NULL,
  result_policy TEXT NOT NULL,
  data_region TEXT NOT NULL DEFAULT 'EU',
  campaign_id UUID REFERENCES campaigns(id),
  platform_locked BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS polls_platform_idx ON polls(platform);
CREATE INDEX IF NOT EXISTS polls_data_region_idx ON polls(data_region);
CREATE INDEX IF NOT EXISTS polls_campaign_idx ON polls(campaign_id);

CREATE TABLE IF NOT EXISTS poll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS poll_items_poll_idx ON poll_items(poll_id);

CREATE TABLE IF NOT EXISTS vote_participation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  participated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS vote_participation_poll_subject_uidx
  ON vote_participation(poll_id, subject_id);

CREATE TABLE IF NOT EXISTS vote_ballots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  display_name TEXT,
  grades JSONB NOT NULL,
  voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS vote_ballots_poll_subject_uidx
  ON vote_ballots(poll_id, subject_id);

CREATE INDEX IF NOT EXISTS vote_ballots_poll_display_idx
  ON vote_ballots(poll_id, display_name);

CREATE TABLE IF NOT EXISTS grade_histograms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES poll_items(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS grade_histograms_poll_item_grade_uidx
  ON grade_histograms(poll_id, item_id, grade);

CREATE TABLE IF NOT EXISTS result_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  vote_count INTEGER NOT NULL,
  visible BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS result_snapshots_poll_version_uidx
  ON result_snapshots(poll_id, version);

CREATE INDEX IF NOT EXISTS result_snapshots_poll_idx ON result_snapshots(poll_id);

CREATE TABLE IF NOT EXISTS processed_vote_events (
  event_id TEXT PRIMARY KEY,
  poll_id UUID NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
