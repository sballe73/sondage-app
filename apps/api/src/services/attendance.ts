import type { Platform } from "@sondage/shared";
import { formatTsvRow, labelForGrade } from "@sondage/shared";
import {
  countBallots,
  countParticipation,
  getPollById,
  listBallotsPage,
  listParticipationPage,
} from "@sondage/db";
import { toIsoString } from "../serialize-timestamp.js";

export const ATTENDANCE_PAGE_SIZE = 100;
export const ATTENDANCE_TSV_MAX_ROWS = 10_000;

export type AttendanceVoter = {
  displayName: string;
  platform: Platform;
  participatedAt: string | null;
  grades?: {
    itemId: string;
    itemLabel: string;
    grade: number;
    gradeLabel: string;
  }[];
};

export type AttendancePage = {
  voterMode: "anonymous" | "public";
  total: number;
  offset: number;
  limit: number;
  voters: AttendanceVoter[];
};

type PollData = NonNullable<Awaited<ReturnType<typeof getPollById>>>;

function mapParticipationRows(
  rows: Awaited<ReturnType<typeof listParticipationPage>>
): AttendanceVoter[] {
  return rows.map((row) => ({
    displayName: row.displayName ?? "Anonyme",
    platform: row.platform as Platform,
    participatedAt: toIsoString(row.participatedAt) ?? null,
  }));
}

function mapBallotRows(
  ballots: Awaited<ReturnType<typeof listBallotsPage>>,
  data: PollData
): AttendanceVoter[] {
  const itemLabels = new Map(data.items.map((item) => [item.id, item.label]));
  const { gradeLabels, gradeMin } = data.poll;

  return ballots.map((ballot) => ({
    displayName: ballot.displayName ?? "Anonyme",
    platform: ballot.platform as Platform,
    participatedAt: toIsoString(ballot.votedAt) ?? null,
    grades: ballot.grades.map((g) => ({
      itemId: g.itemId,
      itemLabel: itemLabels.get(g.itemId) ?? g.itemId,
      grade: g.grade,
      gradeLabel: labelForGrade(g.grade, gradeLabels as string[], gradeMin),
    })),
  }));
}

export async function fetchAttendancePage(
  pollId: string,
  offset: number,
  limit: number
): Promise<AttendancePage> {
  const data = await getPollById(pollId);
  if (!data) {
    throw new Error("Poll not found");
  }

  const voterMode = data.poll.voterMode as "anonymous" | "public";
  if (voterMode === "anonymous") {
    const [total, rows] = await Promise.all([
      countParticipation(pollId),
      listParticipationPage(pollId, offset, limit),
    ]);
    return {
      voterMode,
      total,
      offset,
      limit,
      voters: mapParticipationRows(rows),
    };
  }

  const [total, ballots] = await Promise.all([
    countBallots(pollId),
    listBallotsPage(pollId, offset, limit),
  ]);
  return {
    voterMode,
    total,
    offset,
    limit,
    voters: mapBallotRows(ballots, data),
  };
}

/** Export TSV complet (paginé côté serveur par tranches de 100). */
export async function fetchAllAttendanceVoters(
  pollId: string,
  maxRows = ATTENDANCE_TSV_MAX_ROWS
): Promise<AttendancePage> {
  const first = await fetchAttendancePage(pollId, 0, ATTENDANCE_PAGE_SIZE);
  if (first.total <= first.voters.length || first.voters.length >= maxRows) {
    return {
      ...first,
      voters: first.voters.slice(0, maxRows),
      limit: first.voters.length,
    };
  }

  const voters = [...first.voters];
  for (
    let offset = ATTENDANCE_PAGE_SIZE;
    offset < first.total && voters.length < maxRows;
    offset += ATTENDANCE_PAGE_SIZE
  ) {
    const page = await fetchAttendancePage(
      pollId,
      offset,
      Math.min(ATTENDANCE_PAGE_SIZE, maxRows - voters.length)
    );
    voters.push(...page.voters);
  }

  return {
    voterMode: first.voterMode,
    total: first.total,
    offset: 0,
    limit: voters.length,
    voters,
  };
}

function formatBallotTsv(
  grades: AttendanceVoter["grades"],
  gradeLabels: string[],
  gradeMin: number
): string {
  if (!grades?.length) return "";
  return grades
    .map((g) => {
      const label =
        g.gradeLabel || labelForGrade(g.grade, gradeLabels, gradeMin);
      return `${g.itemLabel}: ${label}`;
    })
    .join("; ");
}

export function buildAttendanceTsv(
  pollName: string,
  page: Pick<AttendancePage, "voterMode" | "voters">,
  gradeLabels: string[] = [],
  gradeMin = 1
): string {
  const isPublic = page.voterMode === "public";
  const lines = [
    formatTsvRow(["Sondage", pollName]),
    formatTsvRow(
      isPublic
        ? ["Nom", "Plateforme", "Date", "Bulletin"]
        : ["Nom", "Plateforme", "Date"]
    ),
  ];

  for (const voter of page.voters) {
    const date = voter.participatedAt ?? "";
    if (isPublic) {
      lines.push(
        formatTsvRow([
          voter.displayName,
          voter.platform,
          date,
          formatBallotTsv(voter.grades, gradeLabels, gradeMin),
        ])
      );
    } else {
      lines.push(
        formatTsvRow([voter.displayName, voter.platform, date])
      );
    }
  }

  return `${lines.join("\n")}\n`;
}
