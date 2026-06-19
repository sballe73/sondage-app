import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  creatorId: text("creator_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const polls = pgTable(
  "polls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    creatorId: text("creator_id").notNull(),
    platform: text("platform").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    visibility: text("visibility").notNull(),
    groupId: text("group_id"),
    voterMode: text("voter_mode").notNull(),
    gradeMin: integer("grade_min").notNull().default(1),
    gradeMax: integer("grade_max").notNull().default(7),
    gradeLabels: jsonb("grade_labels")
      .notNull()
      .$type<string[]>()
      .default([
        "Excellent",
        "Très bien",
        "Bien",
        "Assez bien",
        "Passable",
        "Insuffisant",
        "À Rejeter",
      ]),
    bestGradeIsLowest: boolean("best_grade_is_lowest").notNull().default(true),
    resultPolicy: text("result_policy").notNull(),
    dataRegion: text("data_region").notNull().default("EU"),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    platformLocked: boolean("platform_locked").notNull().default(false),
    mockSnapshotEveryVote: boolean("mock_snapshot_every_vote")
      .notNull()
      .default(false),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("polls_platform_idx").on(t.platform),
    index("polls_data_region_idx").on(t.dataRegion),
    index("polls_campaign_idx").on(t.campaignId),
  ]
);

export const pollItems = pgTable(
  "poll_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("poll_items_poll_idx").on(t.pollId)]
);

export const voteParticipation = pgTable(
  "vote_participation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    subjectId: text("subject_id").notNull(),
    displayName: text("display_name"),
    participatedAt: timestamp("participated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("vote_participation_poll_platform_subject_uidx").on(
      t.pollId,
      t.platform,
      t.subjectId
    ),
  ]
);

export const voteBallots = pgTable(
  "vote_ballots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    subjectId: text("subject_id").notNull(),
    displayName: text("display_name"),
    grades: jsonb("grades").notNull().$type<{ itemId: string; grade: number }[]>(),
    votedAt: timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vote_ballots_poll_platform_subject_uidx").on(
      t.pollId,
      t.platform,
      t.subjectId
    ),
    index("vote_ballots_poll_display_idx").on(t.pollId, t.displayName),
  ]
);

export const gradeHistograms = pgTable(
  "grade_histograms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => pollItems.id, { onDelete: "cascade" }),
    grade: integer("grade").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("grade_histograms_poll_item_grade_uidx").on(
      t.pollId,
      t.itemId,
      t.grade
    ),
  ]
);

export const resultSnapshots = pgTable(
  "result_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    voteCount: integer("vote_count").notNull(),
    visible: boolean("visible").notNull(),
    payload: jsonb("payload").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("result_snapshots_poll_version_uidx").on(t.pollId, t.version),
    index("result_snapshots_poll_idx").on(t.pollId),
  ]
);

export const processedVoteEvents = pgTable(
  "processed_vote_events",
  {
    eventId: text("event_id").primaryKey(),
    pollId: uuid("poll_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }
);
