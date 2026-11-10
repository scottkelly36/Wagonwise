import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { enqueueSignature, listQueuedSignatureJobIds } from '../db/signature-queue';
import type { AttachSignatureRequest } from '@wagonwise/contracts/jobs';
import { useAccessToken } from './use-access-token';
import { PENDING_SIGNATURES_KEY, syncSignatureQueue } from './use-signature-queue-flush';

const SAVE_FAILED_MESSAGE = "Couldn't save the signature. Try again.";

export interface SignatureCapture {
  /** Whether a signature for this job is saved on the phone but not yet uploaded. */
  readonly queuedLocally: boolean;
  readonly error: string | undefined;
  /** Saves the signature to the offline queue first, then tries to send it. Resolves true when it is saved. */
  readonly save: (signature: AttachSignatureRequest) => Promise<boolean>;
}

/** The driver's side of the receiver's signature: save to the offline queue first, then upload, like the photo. */
export function useSignatureCapture(jobId: string): SignatureCapture {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const pending = useQuery({
    queryKey: PENDING_SIGNATURES_KEY,
    queryFn: listQueuedSignatureJobIds,
  });
  const [error, setError] = useState<string | undefined>();

  const save = useCallback(
    async (signature: AttachSignatureRequest): Promise<boolean> => {
      setError(undefined);
      try {
        await enqueueSignature({ jobId, ...signature });
        await queryClient.invalidateQueries({ queryKey: PENDING_SIGNATURES_KEY });
        void syncSignatureQueue(accessToken);
        return true;
      } catch {
        setError(SAVE_FAILED_MESSAGE);
        return false;
      }
    },
    [accessToken, jobId, queryClient],
  );

  return { queuedLocally: pending.data?.includes(jobId) ?? false, error, save };
}
