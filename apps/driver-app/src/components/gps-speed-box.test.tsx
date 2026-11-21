import { render, screen } from '@testing-library/react-native';

import { GpsSpeedBox } from './gps-speed-box';

it('shows the number with its unit and says it is GPS', async () => {
  await render(<GpsSpeedBox reading={{ value: 47, unit: 'mph' }} />);
  expect(screen.getByTestId('gps-speed-value').props.children).toBe(47);
  expect(screen.getByText('mph GPS')).toBeTruthy();
});

it('is read out as a GPS speed that can differ from the speedometer', async () => {
  await render(<GpsSpeedBox reading={{ value: 47, unit: 'mph' }} />);
  expect(screen.getByLabelText(/Your speed from GPS: 47 miles per hour/)).toBeTruthy();
});

it('shows kilometres per hour when that is the unit', async () => {
  await render(<GpsSpeedBox reading={{ value: 80, unit: 'kph' }} />);
  expect(screen.getByText('km/h GPS')).toBeTruthy();
});
