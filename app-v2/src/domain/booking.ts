export type UserRole = 'athlete' | 'coach' | 'admin';

export type BookingStatus =
  | 'draft'
  | 'pending_payment'
  | 'pending_verification'
  | 'pending_coach_approval'
  | 'confirmed'
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'refunded';

export interface Booking {
  id: string;
  athleteId: string;
  coachId: string;
  date: string;
  startHour: number;
  endHour: number;
  venueId?: string;
  venueName: string;
  status: BookingStatus;
  paymentStatus?: string;
  paymentProofPath?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CoachAppointment {
  id: string;
  coachId: string;
  date: string;
  startHour: number;
  endHour: number;
  venueId?: string;
  venueName: string;
}

export interface TravelPolicy {
  mandatoryBufferMinutes: number;
}

export interface ApprovalContext {
  booking: Booking;
  sameDayAppointments: CoachAppointment[];
  paymentReady: boolean;
  travelMinutesBetween?: (fromVenueId: string | undefined, toVenueId: string | undefined) => number | null;
  policy: TravelPolicy;
}

export type ApprovalFailure =
  | 'BOOKING_NOT_PENDING'
  | 'PAYMENT_NOT_READY'
  | 'TIME_OVERLAP'
  | 'TRAVEL_BUFFER_INSUFFICIENT';

export interface ApprovalDecision {
  ok: boolean;
  failure?: ApprovalFailure;
  conflictingAppointmentId?: string;
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

export function evaluateBookingApproval(context: ApprovalContext): ApprovalDecision {
  const { booking, sameDayAppointments, paymentReady, travelMinutesBetween, policy } = context;

  if (!['pending_coach_approval', 'pending_verification'].includes(booking.status)) {
    return { ok: false, failure: 'BOOKING_NOT_PENDING' };
  }

  if (!paymentReady) return { ok: false, failure: 'PAYMENT_NOT_READY' };

  for (const appointment of sameDayAppointments) {
    if (appointment.id === booking.id) continue;

    if (overlaps(booking.startHour, booking.endHour, appointment.startHour, appointment.endHour)) {
      return {
        ok: false,
        failure: 'TIME_OVERLAP',
        conflictingAppointmentId: appointment.id,
      };
    }

    if (!travelMinutesBetween) continue;

    const before = appointment.endHour <= booking.startHour;
    const after = booking.endHour <= appointment.startHour;
    if (!before && !after) continue;

    const gapMinutes = before
      ? (booking.startHour - appointment.endHour) * 60
      : (appointment.startHour - booking.endHour) * 60;

    const fromVenueId = before ? appointment.venueId : booking.venueId;
    const toVenueId = before ? booking.venueId : appointment.venueId;
    const travelMinutes = travelMinutesBetween(fromVenueId, toVenueId);

    if (travelMinutes == null) continue;
    if (gapMinutes < travelMinutes + policy.mandatoryBufferMinutes) {
      return {
        ok: false,
        failure: 'TRAVEL_BUFFER_INSUFFICIENT',
        conflictingAppointmentId: appointment.id,
      };
    }
  }

  return { ok: true };
}
