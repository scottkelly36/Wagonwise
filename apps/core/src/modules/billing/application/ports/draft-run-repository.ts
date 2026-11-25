/** Which months the monthly run has already drafted, so each is done once. */
export interface DraftRunRepository {
  has(month: string): Promise<boolean>;
  record(run: {
    readonly month: string;
    readonly ranAt: Date;
    readonly drafts: number;
    readonly totalPence: number;
  }): Promise<void>;
}
