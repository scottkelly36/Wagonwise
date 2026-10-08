import type { JobDto } from '@wagonwise/contracts/jobs';

import { jobStatusText } from './job-text';

/** The customer copy leaves out everything about the driver and the vehicle, and the instructions written for
 *  drivers. The internal record is for the company: it adds who drove, what with, and the status history. */
export type RecordVariant = 'internal' | 'customer';

export interface RecordPhoto {
  /** A \`data:\` URL built from a validated \`image/*\` response. */
  readonly dataUrl: string;
  readonly capturedAt: string;
}

export interface DeliveryRecordInput {
  readonly job: JobDto;
  readonly variant: RecordVariant;
  readonly generatedAt: Date;
  /** By the stop's position in the job. */
  readonly photos: ReadonlyMap<number, RecordPhoto>;
  /** Internal only: the driver's sign-in identifier (the portal has no driver name), and the vehicle's name. */
  readonly driverLabel?: string | undefined;
  readonly vehicleName?: string | undefined;
}

export interface StopTimes {
  readonly arrivedAt?: string;
  readonly completedAt?: string;
}

/**
 * When the driver arrived at each stop and when they finished it, read from the job's timeline. Finishing a stop is
 * the step after arriving at it (loaded after a collection, delivered after a drop), which is how it is told apart
 * from "loaded" for a job that starts with a delivery: that step has no arrival before it.
 */
export function stopTimes(job: Pick<JobDto, 'timeline' | 'stops'>): StopTimes[] {
  const times: { arrivedAt?: string; completedAt?: string }[] = job.stops.map(() => ({}));
  let previous: string | undefined;
  for (const entry of job.timeline) {
    const index = entry.stopIndex;
    if (index !== undefined && times[index] !== undefined) {
      if (entry.status === 'at_pickup' || entry.status === 'at_delivery') {
        times[index].arrivedAt ??= entry.at;
      } else if (
        (entry.status === 'loaded' || entry.status === 'delivered') &&
        (previous === 'at_pickup' || previous === 'at_delivery')
      ) {
        times[index].completedAt ??= entry.at;
      }
    }
    previous = entry.status;
  }
  return times;
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const WHEN = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/London',
});

function when(iso: string | undefined): string {
  return iso === undefined ? '—' : WHEN.format(new Date(iso));
}

const KIND_LABELS = { pickup: 'Collection', delivery: 'Delivery' } as const;

const STYLE = `
  body { font: 14px/1.5 system-ui, sans-serif; color: #111827; margin: 24px auto; max-width: 780px; padding: 0 16px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 24px 0 8px; }
  .muted { color: #6b7280; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; color: #6b7280; }
  figure { margin: 12px 0; break-inside: avoid; }
  figure img { max-width: 100%; max-height: 520px; border: 1px solid #e5e7eb; }
  figcaption { font-size: 13px; color: #374151; margin-top: 4px; }
  footer { margin-top: 28px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  @media print { body { margin: 0; } }
`;

/**
 * A job's delivery record as a standalone page the browser can print or save as a PDF: the reference, each stop with
 * its times, and the delivery photos. No GPS positions in either version. Every value is escaped; the photo URLs
 * are \`data:\` URLs the caller built from a validated image response.
 */
export function deliveryRecordHtml(input: DeliveryRecordInput): string {
  const { job, variant } = input;
  const internal = variant === 'internal';
  const times = stopTimes(job);
  const title = internal ? 'Delivery record (internal)' : 'Delivery record';

  const stopRows = job.stops
    .map((stop, i) => {
      const t = times[i] ?? {};
      return `<tr>
        <td>${i + 1}</td>
        <td>${KIND_LABELS[stop.kind]}</td>
        <td>${escapeHtml(stop.name)}${
          internal && stop.notes !== undefined
            ? `<div class="muted">${escapeHtml(stop.notes)}</div>`
            : ''
        }</td>
        <td>${escapeHtml(when(t.arrivedAt))}</td>
        <td>${escapeHtml(when(t.completedAt))}</td>
      </tr>`;
    })
    .join('');

  const photos = [...input.photos.entries()]
    .sort(([a], [b]) => a - b)
    .map(([stopIndex, photo]) => {
      const stop = job.stops[stopIndex];
      const label = stop === undefined ? 'Delivery' : `Delivery to ${stop.name}`;
      return `<figure>
        <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(label)}">
        <figcaption>${escapeHtml(label)}. Photo taken ${escapeHtml(when(photo.capturedAt))}.</figcaption>
      </figure>`;
    })
    .join('');

  const internalBlock = internal
    ? `<h2>Job details</h2>
      <table>
        <tr><th>Status</th><td>${escapeHtml(jobStatusText(job))}</td></tr>
        <tr><th>Driver</th><td>${escapeHtml(input.driverLabel ?? 'Not recorded')}</td></tr>
        <tr><th>Vehicle</th><td>${escapeHtml(input.vehicleName ?? 'Not recorded')}</td></tr>
        <tr><th>Planned start</th><td>${escapeHtml(when(job.plannedStart))}</td></tr>
        <tr><th>Due by</th><td>${escapeHtml(when(job.dueBy))}</td></tr>
      </table>
      <h2>Status history</h2>
      <table>${job.timeline
        .map(
          (e) =>
            `<tr><td>${escapeHtml(jobStatusText({ status: e.status, stops: [] }))}</td><td>${escapeHtml(when(e.at))}</td></tr>`,
        )
        .join('')}</table>`
    : '';

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} ${escapeHtml(job.reference)}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="muted">Reference ${escapeHtml(job.reference)}</div>

<h2>Stops</h2>
<table>
  <tr><th>#</th><th>Type</th><th>Place</th><th>Arrived</th><th>Finished</th></tr>
  ${stopRows}
</table>

${photos === '' ? '<p class="muted">No delivery photo is held for this job.</p>' : `<h2>Delivery photos</h2>${photos}`}

${internalBlock}

<footer>
  Record ${escapeHtml(job.id.slice(0, 8))}, made ${escapeHtml(when(input.generatedAt.toISOString()))} from the
  company's WagonWise records. Times are UK local time.${internal ? ' Internal copy: not for customers.' : ''}
</footer>
</body>
</html>`;
}
