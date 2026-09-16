import { describe, expect, it } from 'vitest';
import {
  evaluateCoachAcceptance,
  type BookingCandidate,
  type CoachAcceptanceContext,
  type TimeWindow,
} from './booking';

const hour = 60 * 60 * 1_000;
const dayStart = Date.UTC(2026, 8, 20);
const booking: BookingCandidate = {
  id: 'B1',
  athleteId: 'A1',
  coachId: 'C1',
  startMs: dayStart + 18 * hour,
  endMs: dayStart + 19 * hour,
  venueId: 'visda',
  status: 'pending_coach_approval',
};

const context = (
  existingAppointments: TimeWindow[] = [],
  overrides: Partial<CoachAcceptanceContext> = {},
): CoachAcceptanceContext => ({
  actorUid: 'C1',
  nowMs: dayStart,
  booking,
  existingAppointments,
  timeOff: [],
  mandatoryBufferMinutes: 45,
  travelMinutesBetween: (from, to) => (from === to ? 0 : 35),
  ...overrides,
});

describe('evaluateCoachAcceptance', () => {
  it('allows the assigned coach to accept a valid future booking', () => {
    expect(evaluateCoachAcceptance(context())).toEqual({ ok: true });
  });

  it('blocks a different coach', () => {
    expect(evaluateCoachAcceptance(context([], { actorUid: 'C2' }))).toMatchObject({
      ok: false,
      failure: 'NOT_BOOKING_COACH',
    });
  });

  it('only accepts a booking waiting for coach approval', () => {
    expect(evaluateCoachAcceptance(context([], {
      booking: { ...booking, status: 'pending_verification' },
    }))).toMatchObject({ ok: false, failure: 'BOOKING_NOT_PENDING' });
  });

  it('blocks invalid and past windows', () => {
    expect(evaluateCoachAcceptance(context([], {
      booking: { ...booking, endMs: booking.startMs },
    }))).toMatchObject({ ok: false, failure: 'INVALID_TIME_WINDOW' });
    expect(evaluateCoachAcceptance(context([], { nowMs: booking.startMs }))).toMatchObject({
      ok: false,
      failure: 'BOOKING_IN_PAST',
    });
  });

  it('rejects invalid buffer and travel policies', () => {
    expect(evaluateCoachAcceptance(context([], { mandatoryBufferMinutes: -1 }))).toMatchObject({
      ok: false,
      failure: 'INVALID_POLICY',
    });
    const appointment = {
      id: 'X0',
      startMs: booking.startMs - 3 * hour,
      endMs: booking.startMs - 2 * hour,
      venueId: 'tropp',
    };
    expect(evaluateCoachAcceptance(context([appointment], {
      travelMinutesBetween: () => Number.NaN,
    }))).toEqual({ ok: false, failure: 'TRAVEL_TIME_INVALID', conflictingId: 'X0' });
  });

  it('blocks coach time off', () => {
    expect(evaluateCoachAcceptance(context([], {
      timeOff: [{ id: 'OFF1', startMs: booking.startMs, endMs: booking.endMs }],
    }))).toEqual({ ok: false, failure: 'COACH_TIME_OFF', conflictingId: 'OFF1' });
  });

  it('blocks overlapping appointments', () => {
    const appointment = {
      id: 'X1',
      startMs: booking.startMs - 30 * 60_000,
      endMs: booking.endMs,
      venueId: 'visda',
    };
    expect(evaluateCoachAcceptance(context([appointment]))).toEqual({
      ok: false,
      failure: 'TIME_OVERLAP',
      conflictingId: 'X1',
    });
  });

  it('requires travel time plus the mandatory buffer', () => {
    const appointment = {
      id: 'X2',
      startMs: booking.startMs - 2 * hour,
      endMs: booking.startMs - hour,
      venueId: 'tropp',
    };
    expect(evaluateCoachAcceptance(context([appointment]))).toEqual({
      ok: false,
      failure: 'TRAVEL_BUFFER_INSUFFICIENT',
      conflictingId: 'X2',
    });
  });

  it('can fail closed when travel time is unavailable', () => {
    const appointment = {
      id: 'X3',
      startMs: booking.startMs - 3 * hour,
      endMs: booking.startMs - 2 * hour,
      venueId: 'unknown',
    };
    expect(evaluateCoachAcceptance(context([appointment], {
      travelMinutesBetween: () => null,
      rejectWhenTravelUnknown: true,
    }))).toEqual({ ok: false, failure: 'TRAVEL_TIME_UNKNOWN', conflictingId: 'X3' });
  });
});
