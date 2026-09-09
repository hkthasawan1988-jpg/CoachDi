import { describe, expect, it } from 'vitest';
import { evaluateBookingApproval, type Booking, type CoachAppointment } from './booking';

const booking: Booking = {
  id: 'B1',
  athleteId: 'A1',
  coachId: 'C1',
  date: '2026-09-10',
  startHour: 18,
  endHour: 19,
  venueId: 'visda',
  venueName: 'VISDA',
  status: 'pending_coach_approval',
  createdAt: 1,
  updatedAt: 1,
};

const context = (appointments: CoachAppointment[] = []) => ({
  booking,
  sameDayAppointments: appointments,
  paymentReady: true,
  policy: { mandatoryBufferMinutes: 45 },
  travelMinutesBetween: (from?: string, to?: string) => {
    if (from === to) return 0;
    if (from === 'skyline' && to === 'visda') return 35;
    if (from === 'visda' && to === 'skyline') return 35;
    return null;
  },
});

describe('evaluateBookingApproval', () => {
  it('allows a clean paid booking', () => {
    expect(evaluateBookingApproval(context())).toEqual({ ok: true });
  });

  it('blocks unpaid booking', () => {
    expect(evaluateBookingApproval({ ...context(), paymentReady: false }).failure).toBe('PAYMENT_NOT_READY');
  });

  it('blocks overlapping appointment', () => {
    const appointment: CoachAppointment = {
      id: 'X1', coachId: 'C1', date: booking.date, startHour: 18, endHour: 20,
      venueId: 'visda', venueName: 'VISDA',
    };
    const result = evaluateBookingApproval(context([appointment]));
    expect(result.failure).toBe('TIME_OVERLAP');
    expect(result.conflictingAppointmentId).toBe('X1');
  });

  it('blocks insufficient travel plus mandatory buffer', () => {
    const appointment: CoachAppointment = {
      id: 'X2', coachId: 'C1', date: booking.date, startHour: 16, endHour: 17,
      venueId: 'skyline', venueName: 'Skyline',
    };
    expect(evaluateBookingApproval(context([appointment])).failure).toBe('TRAVEL_BUFFER_INSUFFICIENT');
  });
});
