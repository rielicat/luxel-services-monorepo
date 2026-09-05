import { describe, it, expect } from 'vitest';
import { matchableEmails } from '@luxel/core/channels/connection';

const LINK = 'https://my.hospitable.com/invite/abc';

describe('which emails may attribute a listing to a host', () => {
  it('always trusts the signup email', () => {
    expect(
      matchableEmails({ signupEmail: 'Host@Test.CL', claimedEmail: null, inviteUrl: null }),
    ).toEqual(['host@test.cl']);
  });

  it('ignores a claimed Airbnb email until an operator has recorded the invitation', () => {
    expect(
      matchableEmails({
        signupEmail: 'host@test.cl',
        claimedEmail: 'other@test.cl',
        inviteUrl: null,
      }),
    ).toEqual(['host@test.cl']);
  });

  it('trusts the claimed email once the invitation is recorded', () => {
    expect(
      matchableEmails({
        signupEmail: 'host@test.cl',
        claimedEmail: ' Other@Test.cl ',
        inviteUrl: LINK,
      }),
    ).toEqual(['host@test.cl', 'other@test.cl']);
  });

  it('never repeats one address and survives a missing signup email', () => {
    expect(
      matchableEmails({
        signupEmail: 'host@test.cl',
        claimedEmail: 'HOST@test.cl',
        inviteUrl: LINK,
      }),
    ).toEqual(['host@test.cl']);
    expect(
      matchableEmails({ signupEmail: null, claimedEmail: 'host@test.cl', inviteUrl: LINK }),
    ).toEqual(['host@test.cl']);
    expect(matchableEmails({ signupEmail: null, claimedEmail: null, inviteUrl: LINK })).toEqual([]);
  });
});
