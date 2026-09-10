import { getDatabase } from 'firebase-admin/database';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = getDatabase();

function requireAuth(request: any) {
  const uid = request.auth?.uid as string | undefined;
  if (!uid) throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบ');
  return uid;
}

async function requireAdmin(uid: string) {
  const role = String((await db.ref(`users/${uid}/role`).get()).val() || '');
  if (role !== 'admin') throw new HttpsError('permission-denied', 'Admin only');
}

function cleanDate(v: unknown) {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HttpsError('invalid-argument', 'วันที่ไม่ถูกต้อง');
  return s;
}

export const getAdminPlatformOverview = onCall({ region: 'asia-southeast1' }, async (request) => {
  const uid = requireAuth(request);
  await requireAdmin(uid);

  const [usersSnap, bookingsSnap, refundsSnap] = await Promise.all([
    db.ref('users').get(),
    db.ref('bookings').get(),
    db.ref('refunds').get(),
  ]);

  const users = usersSnap.val() || {};
  const bookings = bookingsSnap.val() || {};
  const refunds = refundsSnap.val() || {};
  const userRows = Object.entries(users).map(([id, value]: any) => ({ id, ...(value || {}) }));
  const bookingRows = Object.entries(bookings).map(([id, value]: any) => ({ id, ...(value || {}) }));
  const refundRows = Object.entries(refunds).map(([id, value]: any) => ({ id, ...(value || {}) }));

  return {
    ok: true,
    metrics: {
      totalBookings: bookingRows.length,
      totalCustomers: userRows.filter((u: any) => u.role === 'athlete').length,
      totalCoaches: userRows.filter((u: any) => u.role === 'coach').length,
      activeCoaches: userRows.filter((u: any) => u.role === 'coach' && String(u.status || 'active') === 'active').length,
      pendingRefunds: refundRows.filter((r: any) => ['requested', 'processing'].includes(String(r.status))).length,
    },
    bookings: bookingRows.sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0)),
  };
});

export const getAdminCoachSchedule = onCall({ region: 'asia-southeast1' }, async (request) => {
  const uid = requireAuth(request);
  await requireAdmin(uid);
  const date = cleanDate(request.data?.date);

  const [usersSnap, bookingsSnap, publicScheduleSnap, timeOffSnap] = await Promise.all([
    db.ref('users').get(),
    db.ref('bookings').orderByChild('date').equalTo(date).get(),
    db.ref('coachPublicSchedule').get(),
    db.ref('coachTimeOff').get(),
  ]);

  const users = usersSnap.val() || {};
  const bookings = bookingsSnap.val() || {};
  const publicSchedule = publicScheduleSnap.val() || {};
  const timeOff = timeOffSnap.val() || {};

  const coaches = Object.entries(users)
    .filter(([, value]: any) => value?.role === 'coach')
    .map(([id, value]: any) => ({
      id,
      name: value?.displayName || value?.email || id,
      status: value?.status || 'active',
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const rows: Record<string, any[]> = {};
  for (const coach of coaches) rows[coach.id] = [];

  for (const [bookingId, raw] of Object.entries(bookings) as any) {
    const b: any = raw || {};
    if (!rows[b.coachId]) continue;
    rows[b.coachId].push({
      id: bookingId,
      source: 'booking',
      status: b.status || '',
      start: Number(b.start ?? b.startHour ?? 0),
      end: Number(b.end ?? b.endHour ?? Number(b.start ?? b.startHour ?? 0) + 1),
      athleteName: b.athleteName || b.athlete || '',
      venueName: b.venueName || b.venue || '',
      courtNumber: b.courtNumber || b.court || '',
    });
  }

  for (const [coachId, items] of Object.entries(publicSchedule) as any) {
    if (!rows[coachId]) continue;
    for (const [id, raw] of Object.entries(items || {}) as any) {
      const item: any = raw || {};
      if (item.date !== date) continue;
      rows[coachId].push({
        id,
        source: item.source || 'coach_existing_appointment',
        status: 'busy',
        start: Number(item.start || 0),
        end: Number(item.end || Number(item.start || 0) + 1),
        athleteName: '',
        venueName: item.venueName || '',
        courtNumber: '',
      });
    }
  }

  for (const coachId of Object.keys(rows)) {
    const blocks = timeOff?.[coachId] || {};
    for (const [id, raw] of Object.entries(blocks) as any) {
      const item: any = raw || {};
      if (item.date && item.date !== date) continue;
      if (item.startDate && date < item.startDate) continue;
      if (item.endDate && date > item.endDate) continue;
      if (!item.date && !item.startDate) continue;
      rows[coachId].push({
        id,
        source: 'time_off',
        status: 'time_off',
        start: Number(item.start ?? 0),
        end: Number(item.end ?? 24),
        athleteName: '',
        venueName: item.reason || 'วันหยุด',
        courtNumber: '',
      });
    }
    rows[coachId].sort((a, b) => a.start - b.start || a.end - b.end);
  }

  return { ok: true, date, coaches, schedule: rows };
});
