-- Platform on vote records (multi-auth) + display name on participation (attendance sheet)

ALTER TABLE vote_participation ADD COLUMN platform TEXT;
ALTER TABLE vote_ballots ADD COLUMN platform TEXT;

UPDATE vote_participation vp
SET platform = p.platform
FROM polls p
WHERE vp.poll_id = p.id;

UPDATE vote_ballots vb
SET platform = p.platform
FROM polls p
WHERE vb.poll_id = p.id;

ALTER TABLE vote_participation ALTER COLUMN platform SET NOT NULL;
ALTER TABLE vote_ballots ALTER COLUMN platform SET NOT NULL;

ALTER TABLE vote_participation ADD COLUMN display_name TEXT;

DROP INDEX IF EXISTS vote_participation_poll_subject_uidx;
CREATE UNIQUE INDEX vote_participation_poll_platform_subject_uidx
  ON vote_participation(poll_id, platform, subject_id);

DROP INDEX IF EXISTS vote_ballots_poll_subject_uidx;
CREATE UNIQUE INDEX vote_ballots_poll_platform_subject_uidx
  ON vote_ballots(poll_id, platform, subject_id);
