ALTER TABLE polls
  ADD COLUMN IF NOT EXISTS grade_labels JSONB NOT NULL DEFAULT '["Excellent","Très bien","Bien","Assez bien","Passable","Insuffisant","À Rejeter"]'::jsonb;

ALTER TABLE polls
  ADD COLUMN IF NOT EXISTS best_grade_is_lowest BOOLEAN NOT NULL DEFAULT TRUE;
