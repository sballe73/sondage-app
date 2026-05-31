import type { InjectOptions, LightMyRequestResponse } from "fastify";
import type { FastifyInstance } from "fastify";

const DATA_REGION = "EU";

export function normalizeResultsErrorBody(body: Record<string, unknown>) {
  const details =
    body.details && typeof body.details === "object"
      ? (body.details as Record<string, unknown>)
      : {};
  return {
    voteCount:
      (details.voteCount as number | undefined) ??
      (body.voteCount as number | undefined),
    policy:
      (details.policy as string | undefined) ??
      (body.policy as string | undefined),
    endsAt: details.endsAt ?? body.endsAt,
    code: body.code as string | undefined,
  };
}

/** Même logique que le widget créateur (`refreshStatus`). */
export function creatorDisplayedVoteCount(
  pollBody: { voteCount?: number },
  resultsStatus: number,
  resultsBody: Record<string, unknown>
): number {
  if (resultsStatus === 200) {
    const live = resultsBody.liveVoteCount as number | undefined;
    const snap = resultsBody.voteCount as number | undefined;
    return live ?? snap ?? pollBody.voteCount ?? 0;
  }
  if (resultsStatus === 403 || resultsStatus === 404) {
    const info = normalizeResultsErrorBody(resultsBody);
    return info.voteCount ?? pollBody.voteCount ?? 0;
  }
  return pollBody.voteCount ?? 0;
}

/** Même logique que le widget résultats (`renderHidden` / `renderResults`). */
export function resultsDisplayedVoteCount(
  pollBody: { voteCount?: number } | null,
  resultsStatus: number,
  resultsBody: Record<string, unknown>
): number {
  if (resultsStatus === 403 || resultsStatus === 404) {
    const info = normalizeResultsErrorBody(resultsBody);
    return info.voteCount ?? pollBody?.voteCount ?? 0;
  }
  if (resultsStatus === 200) {
    const live = resultsBody.liveVoteCount as number | undefined;
    const snap = resultsBody.voteCount as number | undefined;
    return live ?? snap ?? pollBody?.voteCount ?? 0;
  }
  return pollBody?.voteCount ?? 0;
}

export async function injectJson(
  app: FastifyInstance,
  opts: InjectOptions
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject(opts);
  let body: Record<string, unknown> = {};
  if (res.body) {
    try {
      body = res.json() as Record<string, unknown>;
    } catch {
      body = { raw: res.body };
    }
  }
  return { status: res.statusCode, body };
}

export async function fetchPollView(app: FastifyInstance, pollId: string) {
  return injectJson(app, {
    method: "GET",
    url: `/polls/${pollId}`,
    headers: { "X-Data-Region": DATA_REGION },
  });
}

export async function fetchResultsView(app: FastifyInstance, pollId: string) {
  return injectJson(app, {
    method: "GET",
    url: `/polls/${pollId}/results`,
    headers: { "X-Data-Region": DATA_REGION },
  });
}

export async function fetchCreatorWidgetView(
  app: FastifyInstance,
  pollId: string
) {
  const poll = await fetchPollView(app, pollId);
  const results = await fetchResultsView(app, pollId);
  return {
    poll: poll.body,
    resultsStatus: results.status,
    resultsBody: results.body,
    displayedVoteCount: creatorDisplayedVoteCount(
      poll.body,
      results.status,
      results.body
    ),
  };
}

export async function fetchResultsWidgetView(
  app: FastifyInstance,
  pollId: string
) {
  const poll = await fetchPollView(app, pollId);
  const results = await fetchResultsView(app, pollId);
  return {
    poll: poll.body,
    resultsStatus: results.status,
    resultsBody: results.body,
    displayedVoteCount: resultsDisplayedVoteCount(
      poll.body,
      results.status,
      results.body
    ),
    snapshotVersion:
      results.status === 200
        ? (results.body.version as number | undefined)
        : undefined,
    snapshotVoteCount:
      results.status === 200
        ? (results.body.voteCount as number | undefined)
        : undefined,
    liveVoteCount:
      results.status === 200
        ? (results.body.liveVoteCount as number | undefined)
        : undefined,
  };
}

export function assertInjectOk(res: LightMyRequestResponse, label: string) {
  if (res.statusCode >= 400) {
    throw new Error(`${label}: HTTP ${res.statusCode} ${res.body}`);
  }
}
