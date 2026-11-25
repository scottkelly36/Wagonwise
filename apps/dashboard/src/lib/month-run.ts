import { ApiError } from '../api/errors';

/** The smallest card payment Stripe takes in pounds: 30p. A smaller invoice is issued and left for the firm to pay another way. */
export const MIN_COLLECT_PENCE = 30;

export interface DraftToRun {
  readonly id: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly totalPence: number;
}

export interface RunPlan {
  /** Issue, then charge the card or bank details on file. */
  readonly issueAndCollect: readonly DraftToRun[];
  /** Issue only: the firm has no payment details, or the invoice is under the smallest payment. The firm is left to pay another way. */
  readonly issueOnly: readonly {
    readonly draft: DraftToRun;
    readonly reason: 'no_card' | 'under_minimum';
  }[];
  /** Left as drafts for the owner to look at: nothing to issue (a nil or negative total). */
  readonly leave: readonly DraftToRun[];
  readonly totalPence: number;
}

/**
 * What "Issue and collect all" would do for a month's drafts, worked out before anything is pressed so the owner can see it. A firm with
 * payment details on file and a total of at least 30p is charged; any other firm's invoice is issued and left unpaid; a draft with nothing
 * to charge is left alone.
 */
export function planMonthRun(
  drafts: readonly DraftToRun[],
  detailsOnFile: ReadonlyMap<string, boolean>,
): RunPlan {
  const issueAndCollect: DraftToRun[] = [];
  const issueOnly: { draft: DraftToRun; reason: 'no_card' | 'under_minimum' }[] = [];
  const leave: DraftToRun[] = [];
  for (const draft of drafts) {
    if (draft.totalPence <= 0) leave.push(draft);
    else if (detailsOnFile.get(draft.companyId) !== true)
      issueOnly.push({ draft, reason: 'no_card' });
    else if (draft.totalPence < MIN_COLLECT_PENCE)
      issueOnly.push({ draft, reason: 'under_minimum' });
    else issueAndCollect.push(draft);
  }
  const issued = [...issueAndCollect, ...issueOnly.map((i) => i.draft)];
  return {
    issueAndCollect,
    issueOnly,
    leave,
    totalPence: issued.reduce((sum, d) => sum + d.totalPence, 0),
  };
}

export type RunStatus = 'charging' | 'issued' | 'issue_failed' | 'issued_not_charged';

export interface RunResult {
  readonly company: string;
  readonly totalPence: number;
  readonly status: RunStatus;
  /** Why, in the owner's words, when something did not go through. */
  readonly note?: string | undefined;
}

export interface RunIo {
  issue(invoiceId: string): Promise<void>;
  collect(invoiceId: string): Promise<void>;
  describe(error: unknown): string;
}

/**
 * Does the plan, one firm at a time. A firm that fails does not stop the rest: its result says what went wrong and the run carries on. The
 * one exception is WagonWise's own billing details still holding [brackets], which would stop every invoice, so the run stops there and
 * says so, with nothing issued. A collection that was asked for is "charging": the provider tells us later if it was paid.
 */
export async function executeMonthRun(
  plan: RunPlan,
  io: RunIo,
): Promise<{ readonly results: RunResult[]; readonly stoppedBy?: string }> {
  const results: RunResult[] = [];
  const queue: { draft: DraftToRun; collect: boolean }[] = [
    ...plan.issueAndCollect.map((draft) => ({ draft, collect: true })),
    ...plan.issueOnly.map((i) => ({ draft: i.draft, collect: false })),
  ];
  for (const { draft, collect } of queue) {
    try {
      await io.issue(draft.id);
    } catch (error) {
      if (error instanceof ApiError && error.tag === 'BillingDetailsIncomplete') {
        return { results, stoppedBy: io.describe(error) };
      }
      results.push({
        company: draft.companyName,
        totalPence: draft.totalPence,
        status: 'issue_failed',
        note: io.describe(error),
      });
      continue;
    }
    if (!collect) {
      results.push({ company: draft.companyName, totalPence: draft.totalPence, status: 'issued' });
      continue;
    }
    try {
      await io.collect(draft.id);
      results.push({
        company: draft.companyName,
        totalPence: draft.totalPence,
        status: 'charging',
      });
    } catch (error) {
      results.push({
        company: draft.companyName,
        totalPence: draft.totalPence,
        status: 'issued_not_charged',
        note: io.describe(error),
      });
    }
  }
  return { results };
}

export function runStatusText(status: RunStatus): string {
  switch (status) {
    case 'charging':
      return 'Issued, payment asked for';
    case 'issued':
      return 'Issued';
    case 'issue_failed':
      return 'Not issued';
    case 'issued_not_charged':
      return 'Issued, payment not asked for';
  }
}
