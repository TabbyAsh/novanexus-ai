export type ReconciliationPage<T extends { id: string }> = {
  data: T[];
  has_more: boolean;
};

export type ReconciliationPageRunResult = {
  completedCycle: boolean;
  endingCursor: string | null;
  pagesProcessed: number;
  sessionsVisited: number;
};

/**
 * Checks the newest sessions independently of the durable historical cursor.
 * This bounds the delay for a new payment while a large backfill is underway.
 */
export async function runRecentReconciliationPass<T>(input: {
  listRecent(): Promise<{ data: T[] }>;
  processSession(session: T): Promise<void>;
}): Promise<number> {
  const page = await input.listRecent();
  for (const session of page.data) await input.processSession(session);
  return page.data.length;
}

export async function runReconciliationPages<T extends { id: string }>(input: {
  startingAfter: string | null;
  maxPages: number;
  heartbeatEvery: number;
  listPage(startingAfter: string | null): Promise<ReconciliationPage<T>>;
  processSession(session: T): Promise<void>;
  checkpoint(startingAfter: string | null): Promise<boolean>;
}): Promise<ReconciliationPageRunResult> {
  let startingAfter = input.startingAfter;
  let sessionsVisited = 0;
  const maxPages = Math.max(1, Math.floor(input.maxPages));
  const heartbeatEvery = Math.max(1, Math.floor(input.heartbeatEvery));

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const pageStartCursor = startingAfter;
    const page = await input.listPage(pageStartCursor);
    for (let sessionIndex = 0; sessionIndex < page.data.length; sessionIndex += 1) {
      await input.processSession(page.data[sessionIndex]);
      sessionsVisited += 1;
      if ((sessionIndex + 1) % heartbeatEvery === 0) {
        if (!await input.checkpoint(pageStartCursor)) {
          throw new Error('SERVICE_RECONCILIATION_LEASE_LOST');
        }
      }
    }

    if (!page.has_more) {
      return {
        completedCycle: true,
        endingCursor: startingAfter,
        pagesProcessed: pageNumber + 1,
        sessionsVisited,
      };
    }
    const lastSession = page.data[page.data.length - 1];
    if (!lastSession?.id) throw new Error('SERVICE_RECONCILIATION_INVALID_PAGINATION');
    startingAfter = lastSession.id;
    if (!await input.checkpoint(startingAfter)) {
      throw new Error('SERVICE_RECONCILIATION_LEASE_LOST');
    }
  }

  return {
    completedCycle: false,
    endingCursor: startingAfter,
    pagesProcessed: maxPages,
    sessionsVisited,
  };
}
