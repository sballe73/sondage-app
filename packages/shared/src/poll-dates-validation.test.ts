import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PollDateUpdateError,
  validatePollDateUpdate,
} from "./validation.js";

describe("validatePollDateUpdate", () => {
  const baseNow = new Date("2026-06-08T12:00:00.000Z");
  const futureStart = new Date("2026-06-10T12:00:00.000Z");
  const futureEnd = new Date("2026-06-20T12:00:00.000Z");
  const pastStart = new Date("2026-06-01T12:00:00.000Z");

  it("rejects closed polls", () => {
    assert.throws(
      () =>
        validatePollDateUpdate(
          {
            startsAt: futureStart,
            endsAt: futureEnd,
            closedAt: new Date(),
          },
          { endsAt: new Date("2026-06-25T12:00:00.000Z") },
          baseNow
        ),
      (e: unknown) =>
        e instanceof PollDateUpdateError && e.code === "POLL_CLOSED"
    );
  });

  it("rejects changing startsAt after poll has started", () => {
    assert.throws(
      () =>
        validatePollDateUpdate(
          {
            startsAt: pastStart,
            endsAt: futureEnd,
            closedAt: null,
          },
          { startsAt: futureStart },
          baseNow
        ),
      (e: unknown) =>
        e instanceof PollDateUpdateError && e.code === "POLL_ALREADY_STARTED"
    );
  });

  it("rejects changing endsAt after poll has ended", () => {
    assert.throws(
      () =>
        validatePollDateUpdate(
          {
            startsAt: pastStart,
            endsAt: new Date("2026-06-07T12:00:00.000Z"),
            closedAt: null,
          },
          { endsAt: futureEnd },
          baseNow
        ),
      (e: unknown) =>
        e instanceof PollDateUpdateError && e.code === "POLL_ALREADY_ENDED"
    );
  });

  it("rejects dates in the past", () => {
    assert.throws(
      () =>
        validatePollDateUpdate(
          {
            startsAt: futureStart,
            endsAt: futureEnd,
            closedAt: null,
          },
          { startsAt: new Date("2026-06-08T11:00:00.000Z") },
          baseNow
        ),
      (e: unknown) =>
        e instanceof PollDateUpdateError && e.code === "DATE_IN_PAST"
    );
  });

  it("accepts now as startsAt when poll has not started", () => {
    const result = validatePollDateUpdate(
      {
        startsAt: futureStart,
        endsAt: futureEnd,
        closedAt: null,
      },
      { startsAt: baseNow },
      baseNow
    );
    assert.equal(result.startsAt.getTime(), baseNow.getTime());
    assert.equal(result.endsAt.getTime(), futureEnd.getTime());
  });

  it("rejects invalid poll window after merge", () => {
    assert.throws(
      () =>
        validatePollDateUpdate(
          {
            startsAt: futureStart,
            endsAt: futureEnd,
            closedAt: null,
          },
          { endsAt: new Date("2026-06-09T12:00:00.000Z") },
          baseNow
        ),
      (e: Error) => e.message === "endsAt must be after startsAt"
    );
  });
});
