import * as jobsApi from '../api/jobs';
import { queryClient } from '../api/query-client';
import * as routingApi from '../api/routing';
import { CURRENT_JOB_KEY } from '../api/use-jobs';
import {
  enqueueTripEnd,
  listPendingTripEnds,
  removePendingTripEnd,
  type PendingTripEnd,
} from '../db/trip-outbox';
import { usePendingArrivalsStore } from '../state/pending-arrivals-store';
import { queueTripEnd, refreshPendingArrivals, syncTripOutbox } from './use-trip-outbox-flush';

jest.mock('../api/jobs');
jest.mock('../api/routing');
jest.mock('../db/trip-outbox');
jest.mock('../api/query-client', () => ({ queryClient: { invalidateQueries: jest.fn() } }));

const jobs = jest.mocked(jobsApi);
const routing = jest.mocked(routingApi);
const list = jest.mocked(listPendingTripEnds);

const arrival: PendingTripEnd = {
  tripId: 'trip-1',
  jobAdvance: { jobId: 'job-1', status: 'at_delivery' },
};

beforeEach(() => {
  for (const m of [
    jobs.advanceJobStatus,
    routing.endTrip,
    list,
    jest.mocked(enqueueTripEnd),
    jest.mocked(removePendingTripEnd),
    jest.mocked(queryClient.invalidateQueries),
  ]) {
    m.mockReset();
  }
  usePendingArrivalsStore.setState({ advances: {} });
});

describe('queueing an end', () => {
  it('saves it and shows the arrival on the job at once', async () => {
    list.mockResolvedValue([arrival]);
    await queueTripEnd(arrival);
    expect(enqueueTripEnd).toHaveBeenCalledWith(arrival);
    expect(usePendingArrivalsStore.getState().advances).toEqual({ 'job-1': 'at_delivery' });
  });

  it('loads what is waiting when the app opens', async () => {
    list.mockResolvedValue([arrival, { tripId: 'trip-2' }]);
    await refreshPendingArrivals();
    expect(usePendingArrivalsStore.getState().advances).toEqual({ 'job-1': 'at_delivery' });
  });
});

describe('syncTripOutbox', () => {
  it('does nothing without an access token, since every request would be refused', async () => {
    list.mockResolvedValue([arrival]);
    await syncTripOutbox('');
    expect(list).not.toHaveBeenCalled();
    expect(routing.endTrip).not.toHaveBeenCalled();
  });

  it('sends the arrival then the end, drops them from the queue and refreshes the job', async () => {
    list.mockResolvedValueOnce([arrival]).mockResolvedValue([]);
    jobs.advanceJobStatus.mockResolvedValue(
      {} as Awaited<ReturnType<typeof jobsApi.advanceJobStatus>>,
    );
    routing.endTrip.mockResolvedValue({} as Awaited<ReturnType<typeof routingApi.endTrip>>);
    usePendingArrivalsStore.setState({ advances: { 'job-1': 'at_delivery' } });

    await syncTripOutbox('token-1');

    expect(jobs.advanceJobStatus).toHaveBeenCalledWith('token-1', 'job-1', {
      status: 'at_delivery',
    });
    expect(routing.endTrip).toHaveBeenCalledWith('token-1', 'trip-1', undefined);
    expect(removePendingTripEnd).toHaveBeenCalledWith('trip-1');
    expect(usePendingArrivalsStore.getState().advances).toEqual({});
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: CURRENT_JOB_KEY });
  });

  it('keeps everything queued, and the arrival showing, when there is still no signal', async () => {
    list.mockResolvedValue([arrival]);
    jobs.advanceJobStatus.mockRejectedValue(new TypeError('Network request failed'));
    usePendingArrivalsStore.setState({ advances: { 'job-1': 'at_delivery' } });

    await syncTripOutbox('token-1');

    expect(removePendingTripEnd).not.toHaveBeenCalled();
    expect(usePendingArrivalsStore.getState().advances).toEqual({ 'job-1': 'at_delivery' });
  });

  it('does nothing for an empty queue', async () => {
    list.mockResolvedValue([]);
    await syncTripOutbox('token-1');
    expect(routing.endTrip).not.toHaveBeenCalled();
  });
});
