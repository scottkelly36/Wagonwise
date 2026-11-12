import {
  announcementPreferenceSchema,
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

/** Whether this driver gets notifications from WagonWise about what has changed. On unless they have turned it off. */
export async function getAnnouncementPreference(accessToken: string): Promise<boolean> {
  const { status, json } = await requestJson('GET', '/announcements/preference', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return announcementPreferenceSchema.parse(json).pushes;
}

export async function setAnnouncementPreference(
  accessToken: string,
  pushes: boolean,
): Promise<boolean> {
  const { status, json } = await requestJson('PUT', '/announcements/preference', {
    body: announcementPreferenceSchema.parse({ pushes }),
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return announcementPreferenceSchema.parse(json).pushes;
}
