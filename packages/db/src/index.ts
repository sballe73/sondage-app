export { getDb, closeDb, getDatabaseUrl, schema } from "./client.js";
export * from "./repositories/polls.js";
export * from "./repositories/results.js";
export { computeAndSaveSnapshot } from "./snapshot.js";
export { maybePublishSnapshot } from "./publish-snapshot.js";
export { processVoteEvent, processVoteEventBatch } from "./process-vote-event.js";
export type { ProcessVoteBatchResult } from "./process-vote-batch.js";
export { deleteUserVoteData } from "./delete-user-data.js";
export type { DeleteUserVoteDataResult } from "./delete-user-data.js";
