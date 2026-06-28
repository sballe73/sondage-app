-- Platform on vote records (multi-auth) + display name on participation (attendance sheet)

ALTER TABLE vote_participation ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE vote_ballots ADD COLUMN IF NOT EXISTS platform TEXT;

UPDATE vote_participation vp
SET platform = p.platform
FROM polls p
WHERE vp.poll_id = p.id
  AND vp.platform IS NULL;

UPDATE vote_ballots vb
SET platform = p.platform
FROM polls p
WHERE vb.poll_id = p.id
  AND vb.platform IS NULL;

ALTER TABLE vote_participation ALTER COLUMN platform SET NOT NULL;
ALTER TABLE vote_ballots ALTER COLUMN platform SET NOT NULL;

ALTER TABLE vote_participation ADD COLUMN IF NOT EXISTS display_name TEXT;

DROP INDEX IF EXISTS vote_participation_poll_subject_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS vote_participation_poll_platform_subject_uidx
  ON vote_participation(poll_id, platform, subject_id);

DROP INDEX IF EXISTS vote_ballots_poll_subject_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS vote_ballots_poll_platform_subject_uidx
  ON vote_ballots(poll_id, platform, subject_id);
