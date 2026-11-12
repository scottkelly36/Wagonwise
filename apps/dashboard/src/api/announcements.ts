import {
  announcementListResponseSchema,
  publishAnnouncementResponseSchema,
  type AnnouncementListResponse,
  type CreateAnnouncementRequest,
  type PublishAnnouncementResponse,
} from '@wagonwise/contracts/announcements';

import { requestJson, throwUnlessSuccess } from './http';

const bearer = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` });

export async function listAnnouncements(accessToken: string): Promise<AnnouncementListResponse> {
  const { status, json } = await requestJson('GET', '/staff/announcements', bearer(accessToken));
  throwUnlessSuccess(status, json, [200]);
  return announcementListResponseSchema.parse(json);
}

export async function createAnnouncement(
  accessToken: string,
  request: CreateAnnouncementRequest,
): Promise<PublishAnnouncementResponse> {
  const { status, json } = await requestJson('POST', '/staff/announcements', {
    ...bearer(accessToken),
    body: request,
  });
  throwUnlessSuccess(status, json, [201]);
  return publishAnnouncementResponseSchema.parse(json);
}

export async function deleteAnnouncement(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson(
    'DELETE',
    `/staff/announcements/${id}`,
    bearer(accessToken),
  );
  throwUnlessSuccess(status, json, [204]);
}
