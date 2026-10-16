import { INITIAL_NOTICE, noticeReducer, type NoticeState } from './notice-state';

const open = (key: string): NoticeState => ({ key, mode: 'open' });

describe('noticeReducer', () => {
  it('opens a new notice, and shows nothing when there is none', () => {
    expect(noticeReducer(INITIAL_NOTICE, { type: 'key', key: 'break:later' })).toEqual(
      open('break:later'),
    );
    expect(noticeReducer(open('x'), { type: 'key', key: undefined })).toEqual({
      key: undefined,
      mode: 'hidden',
    });
  });

  it('shrinks to a flag, opens again from the flag, and can be dismissed', () => {
    const flag = noticeReducer(open('a'), { type: 'collapse' });
    expect(flag.mode).toBe('flag');
    expect(noticeReducer(flag, { type: 'expand' }).mode).toBe('open');
    expect(noticeReducer(flag, { type: 'dismiss' }).mode).toBe('hidden');
    expect(noticeReducer(open('a'), { type: 'dismiss' }).mode).toBe('hidden');
  });

  it('stays dismissed while the key is the same, and comes back when it changes', () => {
    const dismissed = noticeReducer(open('break:later'), { type: 'dismiss' });
    expect(noticeReducer(dismissed, { type: 'key', key: 'break:later' })).toBe(dismissed);
    expect(noticeReducer(dismissed, { type: 'expand' })).toBe(dismissed);
    expect(noticeReducer(dismissed, { type: 'collapse' })).toBe(dismissed);
    expect(noticeReducer(dismissed, { type: 'key', key: 'break:soon' })).toEqual(
      open('break:soon'),
    );
  });

  it('re-opens a flag when the key changes', () => {
    const flag = noticeReducer(open('a'), { type: 'collapse' });
    expect(noticeReducer(flag, { type: 'key', key: 'b' })).toEqual(open('b'));
  });

  it('ignores a collapse that is not on an open notice', () => {
    const flag = noticeReducer(open('a'), { type: 'collapse' });
    expect(noticeReducer(flag, { type: 'collapse' })).toBe(flag);
  });
});
