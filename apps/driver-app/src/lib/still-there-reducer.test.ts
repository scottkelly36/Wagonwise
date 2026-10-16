import {
  actionFor,
  INITIAL_STILL_THERE_STATE,
  stillThereQuestion,
  stillThereReducer,
  thanksFor,
} from './still-there-reducer';

describe('stillThereReducer', () => {
  it('goes ask, prompt spoken, heard, and back to idle', () => {
    let state = stillThereReducer(INITIAL_STILL_THERE_STATE, {
      type: 'ask',
      hazardId: 'h1',
      hazardType: 'low_bridge',
    });
    expect(state).toEqual({ phase: 'asking', hazardId: 'h1', type: 'low_bridge' });
    state = stillThereReducer(state, { type: 'prompt-spoken' });
    expect(state.phase).toBe('listening');
    state = stillThereReducer(state, { type: 'heard' });
    expect(state).toEqual(INITIAL_STILL_THERE_STATE);
  });

  it('asks about one hazard at a time', () => {
    const asking = stillThereReducer(INITIAL_STILL_THERE_STATE, {
      type: 'ask',
      hazardId: 'h1',
      hazardType: 'low_bridge',
    });
    expect(
      stillThereReducer(asking, { type: 'ask', hazardId: 'h2', hazardType: 'roadworks' }),
    ).toBe(asking);
  });

  it('ignores a spoken prompt that was not being asked, and stops from anywhere', () => {
    expect(stillThereReducer(INITIAL_STILL_THERE_STATE, { type: 'prompt-spoken' })).toBe(
      INITIAL_STILL_THERE_STATE,
    );
    const asking = stillThereReducer(INITIAL_STILL_THERE_STATE, {
      type: 'ask',
      hazardId: 'h1',
      hazardType: 'low_bridge',
    });
    expect(stillThereReducer(asking, { type: 'stop' })).toEqual(INITIAL_STILL_THERE_STATE);
  });
});

describe('answers', () => {
  it('confirms on yes, dismisses on no, and does nothing otherwise', () => {
    expect(actionFor('yes')).toBe('confirm');
    expect(actionFor('no')).toBe('dismiss');
    expect(actionFor('unclear')).toBe('nothing');
  });

  it('says thanks only when something was done', () => {
    expect(thanksFor('confirm')).toBe('Thanks.');
    expect(thanksFor('dismiss')).toBe('Thanks, noted.');
    expect(thanksFor('nothing')).toBeUndefined();
  });

  it('puts the kind of hazard in the question', () => {
    expect(stillThereQuestion('low_bridge')).toMatch(/^.+: was it still there\? Say yes or no\.$/);
  });
});
