import {
  latestAnnouncementResponseSchema,
  type AnnouncementDto,
} from '@wagonwise/contracts/announcements';

import { requestJson, throwUnlessSuccess } from './http';

/** The newest note from WagonWise about what has changed in the app, or `null` when there has never been one. */
export async function getLatestAnnouncement(accessToken: string): Promise<AnnouncementDto | null> {
  const { status, json } = await requestJson('GET', '/announcements/latest', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return latestAnnouncementResponseSchema.parse(json).announcement;
}
