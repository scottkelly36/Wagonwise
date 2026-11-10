import { fireEvent, render, screen } from '@testing-library/react-native';

import { SignaturePad } from './signature-pad';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30_000);

function touch(x: number, y: number) {
  return { nativeEvent: { locationX: x, locationY: y } };
}

async function drawAcrossPad() {
  const pad = screen.getByTestId('signature-pad');
  await fireEvent(pad, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 500, height: 250 } },
  });
  await fireEvent(pad, 'responderGrant', touch(10, 100));
  await fireEvent(pad, 'responderMove', touch(120, 40));
  await fireEvent(pad, 'responderMove', touch(260, 150));
  await fireEvent(pad, 'responderMove', touch(400, 60));
}

describe('SignaturePad', () => {
  it('turns what is drawn into a request in the 1000 x 500 box, with the name typed', async () => {
    const onSave = jest.fn();
    await render(<SignaturePad visible onSave={onSave} onCancel={jest.fn()} />);
    await drawAcrossPad();
    await fireEvent.changeText(screen.getByTestId('signature-name-input'), ' A. Receiver ');
    await fireEvent.press(screen.getByTestId('signature-save'));
    expect(onSave).toHaveBeenCalledWith({
      signerName: 'A. Receiver',
      strokes: [
        [
          [20, 200],
          [240, 80],
          [520, 300],
          [800, 120],
        ],
      ],
    });
  });

  it('will not save an empty pad, and says so', async () => {
    const onSave = jest.fn();
    await render(<SignaturePad visible onSave={onSave} onCancel={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('signature-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('signature-too-little')).toBeTruthy();
  });

  it('clears what was drawn, and cancel sends nothing', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    await render(<SignaturePad visible onSave={onSave} onCancel={onCancel} />);
    await drawAcrossPad();
    await fireEvent.press(screen.getByTestId('signature-clear'));
    await fireEvent.press(screen.getByTestId('signature-save'));
    expect(onSave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('signature-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
