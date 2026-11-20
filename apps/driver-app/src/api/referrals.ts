import {
  claimRewardRequestSchema,
  myReferralsResponseSchema,
  type MyReferralsResponse,
} from '@wagonwise/contracts/referrals';

import { requestJson, throwUnlessSuccess } from './http';

/** The driver's own referral code (made the first time) and the firms they have recommended. */
export async function getMyReferrals(accessToken: string): Promise<MyReferralsResponse> {
  const { status, json } = await requestJson('GET', '/referrals/me', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return myReferralsResponseSchema.parse(json);
}

/** Says where to send a gift card that is due. */
export async function claimReward(accessToken: string, id: string, email: string): Promise<void> {
  const { status, json } = await requestJson('POST', `/referrals/${id}/claim`, {
    body: claimRewardRequestSchema.parse({ email }),
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
}
