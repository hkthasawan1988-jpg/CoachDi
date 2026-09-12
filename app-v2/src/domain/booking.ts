export type BookingStatus =
  | 'draft'
  | 'pending_coach_approval'
  | 'coach_approved'
  | 'pending_payment'
  | 'pending_verification'
  | 'confirmed'
  | 'completed'
  | 'rejected_by_coach'
  | 'declined'
  | 'cancelled'
  | 'cancelled_by_coach'
  | 'cancelled_by_athlete'
  | 'refunded';

export interface TimeWindow {
  id: string;
  startMs: number;
  endMs: number;
  venueId?: string;
}

export interface BookingCandidate extends TimeWindow {
  athleteId: string;
  coachId: string;
  status: BookingStatus;
}

export interface CoachAcceptanceContext {
  actorUid: string;
  nowMs: number;
  booking: BookingCandidate;
  existingAppointments: TimeWindow[];
  timeOff: TimeWindow[];
  mandatoryBufferMinutes: number;
  travelMinutesBetween?: (
    fromVenueId: string | undefined,
    toVenueId: string | undefined,
  ) => number | null;
  rejectWhenTravelUnknown?: boolean;
}

export type AcceptanceFailure =
  | 'NOT_BOOKING_COACH'
  | 'BOOKING_NOT_PENDING'
  | 'INVALID_TIME_WINDOW'
  | 'INVALID_POLICY'
  | 'BOOKING_IN_PAST'
  | 'COACH_TIME_OFF'
  | 'TIME_OVERLAP'
  | 'TRAVEL_TIME_UNKNOWN'
  | 'TRAVEL_TIME_INVALID'
  | 'TRAVEL_BUFFER_INSUFFICIENT';

export type AcceptanceDecision =
  | { ok: true }
  | { ok: false; failure: AcceptanceFailure; conflictingId?: string };

const overlaps = (a: TimeWindow, b: TimeWindow) =>
  a.startMs < b.endMs && b.startMs < a.endMs;

const conflict = (
  failure: AcceptanceFailure,
  conflictingId?: string,
): AcceptanceDecision => ({ ok: false, failure, ...(conflictingId ? { conflictingId } : {}) });

export function evaluateCoachAcceptance(context: CoachAcceptanceContext): AcceptanceDecision {
  const { booking } = context;

  if (context.actorUid !== booking.coachId) return conflict('NOT_BOOKING_COACH');
  if (booking.status !== 'pending_coach_approval') return conflict('BOOKING_NOT_PENDING');
  if (!Number.isFinite(booking.startMs) || !Number.isFinite(booking.endMs) || booking.startMs >= booking.endMs) {
    return conflict('INVALID_TIME_WINDOW');
  }
  if (!Number.isFinite(context.mandatoryBufferMinutes) || context.mandatoryBufferMinutes < 0) {
    return conflict('INVALID_POLICY');
  }
  if (booking.startMs <= context.nowMs) return conflict('BOOKING_IN_PAST');

  const leave = context.timeOff.find(item => overlaps(booking, item));
  if (leave) return conflict('COACH_TIME_OFF', leave.id);

  const appointments = context.existingAppointments
    .filter(item => item.id !== booking.id)
    .sort((left, right) => left.startMs - right.startMs);

  for (const appointment of appointments) {
    if (overlaps(booking, appointment)) return conflict('TIME_OVERLAP', appointment.id);

    const appointmentBefore = appointment.endMs <= booking.startMs;
    const bookingBefore = booking.endMs <= appointment.startMs;
    if (!appointmentBefore && !bookingBefore) continue;

    const gapMinutes = appointmentBefore
      ? (booking.startMs - appointment.endMs) / 60_000
      : (appointment.startMs - booking.endMs) / 60_000;
    const fromVenueId = appointmentBefore ? appointment.venueId : booking.venueId;
    const toVenueId = appointmentBefore ? booking.venueId : appointment.venueId;

    if (fromVenueId === toVenueId) {
      if (gapMinutes < context.mandatoryBufferMinutes) {
        return conflict('TRAVEL_BUFFER_INSUFFICIENT', appointment.id);
      }
      continue;
    }

    const travelMinutes = context.travelMinutesBetween?.(fromVenueId, toVenueId) ?? null;
    if (travelMinutes === null) {
      if (context.rejectWhenTravelUnknown) return conflict('TRAVEL_TIME_UNKNOWN', appointment.id);
      continue;
    }
    if (!Number.isFinite(travelMinutes) || travelMinutes < 0) {
      return conflict('TRAVEL_TIME_INVALID', appointment.id);
    }
    if (gapMinutes < travelMinutes + context.mandatoryBufferMinutes) {
      return conflict('TRAVEL_BUFFER_INSUFFICIENT', appointment.id);
    }
  }

  return { ok: true };
}
