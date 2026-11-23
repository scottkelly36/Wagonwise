import { exportsPausedMessage } from '../lib/account-banner';

/** Stands where a download or print button would be while the company's account is paused. */
export function ExportsPausedNote() {
  return <p className="text-muted">{exportsPausedMessage()}</p>;
}
