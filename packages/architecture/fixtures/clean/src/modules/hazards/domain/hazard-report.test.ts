// Tests in the domain may import the test runner; domain source files may not.
import { expect, it } from 'vitest';
import { describe as describeReport } from './hazard-report';

it('describes a report', () => {
  expect(describeReport({ id: 'h1' })).toEqual({ ok: true, value: 'h1' });
});
