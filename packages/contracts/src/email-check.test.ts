import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { checkEmail } from './email-check.js';

describe('checkEmail', () => {
  it.each([
    'sam@gmail.com',
    'Sam.Smith@Gmail.com',
    'sam@hotmail.co.uk',
    'sam@btinternet.com',
    'sam@smithhaulage.co.uk',
    'sam@smith-transport.com',
    'office@smith.uk',
    'sam@mail.smith.co.uk',
    'sam@school.sch.uk',
    'sam@council.gov.uk',
    'sam@firm.london',
    'sam@firm.scot',
    'sam@firm.io',
    'sam@firm.co',
    'sam@firm.de',
    'sam@firm.ie',
  ])('has nothing to say about %s', (email) => {
    expect(checkEmail(email)).toEqual({ kind: 'ok' });
  });

  it.each([
    ['sam@gmial.com', 'sam@gmail.com'],
    ['sam@gmail.con', 'sam@gmail.com'],
    ['sam@gmail.co', 'sam@gmail.com'],
    ['sam@gmai.com', 'sam@gmail.com'],
    ['sam@gmail.cm', 'sam@gmail.com'],
    ['sam@gmail.uk', 'sam@gmail.com'],
    ['sam@gmail.co.uk', 'sam@gmail.com'],
    ['sam@hotmial.co.uk', 'sam@hotmail.co.uk'],
    ['sam@hotmail.co.ukk', 'sam@hotmail.co.uk'],
    ['sam@hotmail.com.uk', 'sam@hotmail.co.uk'],
    ['sam@hotmail.uk', 'sam@hotmail.co.uk'],
    ['sam@outlok.com', 'sam@outlook.com'],
    ['sam@yahooo.co.uk', 'sam@yahoo.co.uk'],
    ['sam@yahoo.uk', 'sam@yahoo.co.uk'],
    ['sam@icloud.cm', 'sam@icloud.com'],
    ['sam@btinternet.co', 'sam@btinternet.com'],
    ['sam@gmail.ci.uk', 'sam@gmail.com'],
  ])('says %s is probably %s', (email, suggestion) => {
    expect(checkEmail(email)).toMatchObject({ suggestion });
  });

  it.each([
    ['sam@smith.ci.uk', 'sam@smith.co.uk'],
    ['sam@smithhaulage.cp.uk', 'sam@smithhaulage.co.uk'],
    ['sam@smithhaulage.cm', 'sam@smithhaulage.com'],
  ])('asks whether %s is %s, and lets a real address stand', (email, suggestion) => {
    expect(checkEmail(email)).toEqual({ kind: 'suggest', suggestion });
  });

  it.each([
    ['sam@smithhaulage.couk', 'sam@smithhaulage.co.uk'],
    ['sam@smithhaulage.comg', 'sam@smithhaulage.com'],
    ['sam@smithhaulage.con', 'sam@smithhaulage.com'],
    ['sam@smithhaulage.cmo', 'sam@smithhaulage.com'],
    ['sam@smithhaulage.c', undefined],
    ['sam@smithhaulage.zzzz', undefined],
    ['sam@smithhaulage.c0m', 'sam@smithhaulage.com'],
    ['sam@smithhaulage.co.ukk', 'sam@smithhaulage.co.uk'],
    ['sam@gmail.comg', 'sam@gmail.com'],
  ])('says %s cannot work, and offers %s', (email, suggestion) => {
    const result = checkEmail(email);
    expect(result.kind).toBe('impossible');
    expect('suggestion' in result ? result.suggestion : undefined).toBe(suggestion);
  });

  it('keeps the part before the @ exactly as typed, but reads the domain in lower case', () => {
    expect(checkEmail('  Sam.Smith@GMIAL.com ')).toEqual({
      kind: 'suggest',
      suggestion: 'Sam.Smith@gmail.com',
    });
  });

  it('leaves things that are not addresses to the checks that look at the shape', () => {
    for (const text of ['', 'sam', 'sam@', '@gmail.com', 'sam@localhost']) {
      expect(checkEmail(text)).toEqual({ kind: 'ok' });
    }
  });
});

describe('the landing page copy', () => {
  // The landing pages have no build, so they carry their own copy of the check (made by sites/make-email-check.mjs).
  const source = readFileSync(
    fileURLToPath(new URL('../../../sites/landing/email-check.js', import.meta.url)),
    'utf8',
  );
  const page: { checkEmail?: (text: string) => unknown } = {};
  runInNewContext(source, { window: page });

  it.each([
    'sam@gmail.com',
    'sam@gmial.com',
    'sam@gmail.co.uk',
    'sam@hotmail.uk',
    'sam@yahoo.uk',
    'sam@smith.ci.uk',
    'sam@smithhaulage.couk',
    'sam@smithhaulage.comg',
    'sam@smithhaulage.cm',
    'sam@smithhaulage.c',
    'sam@smithhaulage.co.uk',
    'Sam.Smith@GMIAL.com ',
    'sam@firm.london',
    'sam',
    '',
  ])('answers the same as the app for %j', (email) => {
    expect(page.checkEmail?.(email)).toEqual(checkEmail(email));
  });
});
