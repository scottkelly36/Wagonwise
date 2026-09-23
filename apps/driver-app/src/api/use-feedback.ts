import { useMutation } from '@tanstack/react-query';
import type { SubmitFeedbackRequest } from '@wagonwise/contracts/feedback';

import { useAccessToken } from '../hooks/use-access-token';
import * as feedbackApi from './feedback';

/** A mutation, not a query — sending feedback is an action, same reasoning as every other
 *  create-style call in this app (`useCreateRoutePlan`, `useReportHazard`). */
export function useSubmitFeedback() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (input: SubmitFeedbackRequest) => feedbackApi.submitFeedback(accessToken, input),
  });
}
