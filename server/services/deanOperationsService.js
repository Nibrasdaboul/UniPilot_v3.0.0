import { db } from '../db.js';
import { ADMISSION_TYPES } from '../college/userProfiles.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function n(value) {
  return Number(value) || 0;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'Dean is not attached to a college');
  return cid;
}

function orgUniversityId(user) {
  return user?.org_university_id != null ? Number(user.org_university_id) : 1;
}

export async function getDeanOperations(user) {
  const cid = collegeId(user);
  const uni = orgUniversityId(user);

  const plans = await db.prepare(`
    SELECT p.id, p.total_amount, p.currency, u.id AS user_id,
           COALESCE(sp.admission_type, 'general') AS admission_type
    FROM tuition_plans p
    INNER JOIN users u ON u.id = p.user_id
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    WHERE u.role = 'student' AND u.college_id = ?
  `).all(cid);

  const planIds = plans.map((p) => p.id);
  let installments = [];
  if (planIds.length) {
    installments = await db.prepare(`
      SELECT plan_id, amount, paid_amount, status
      FROM tuition_installments
      WHERE plan_id IN (${planIds.map(() => '?').join(',')})
    `).all(...planIds);
  }

  const paidByPlan = new Map();
  for (const row of installments) {
    paidByPlan.set(row.plan_id, n(paidByPlan.get(row.plan_id)) + n(row.paid_amount));
  }

  const due = plans.reduce((s, p) => s + n(p.total_amount), 0);
  const collected = plans.reduce((s, p) => s + n(paidByPlan.get(p.id)), 0);
  const remaining = Math.max(0, due - collected);
  const collection_rate = due ? Math.round((collected / due) * 1000) / 10 : null;

  const byAdmissionMap = new Map();
  for (const p of plans) {
    const cur = byAdmissionMap.get(p.admission_type) || { due: 0, collected: 0, students: 0 };
    cur.due += n(p.total_amount);
    cur.collected += n(paidByPlan.get(p.id));
    cur.students += 1;
    byAdmissionMap.set(p.admission_type, cur);
  }
  const feeStudents = await db.prepare(`
    SELECT COALESCE(sp.admission_type, 'unknown') AS key, COUNT(*)::int AS count
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    WHERE u.role = 'student' AND u.college_id = ?
    GROUP BY 1
  `).all(cid);

  const by_admission = (ADMISSION_TYPES.some((t) => feeStudents.find((f) => f.key === t.key))
    ? ADMISSION_TYPES
    : []
  ).map((t) => {
    const money = byAdmissionMap.get(t.key) || { due: 0, collected: 0, students: 0 };
    const headcount = n(feeStudents.find((f) => f.key === t.key)?.count);
    return {
      key: t.key,
      ar: t.ar,
      en: t.en,
      students: headcount,
      due: money.due,
      collected: money.collected,
    };
  }).filter((t) => t.students > 0 || t.due > 0);

  const rooms = await db.prepare(`
    SELECT id, name, building, capacity, room_type, is_active
    FROM facility_rooms
    WHERE university_id = ?
    ORDER BY id
  `).all(uni);

  const halls = await db.prepare(`
    SELECT id, name, building, capacity
    FROM exam_halls
    WHERE university_id = ?
    ORDER BY id
  `).all(uni);

  const busyRooms = await db.prepare(`
    SELECT room_id
    FROM facility_bookings
    WHERE university_id = ?
      AND status IN ('approved', 'confirmed')
      AND starts_at <= CURRENT_TIMESTAMP
      AND ends_at >= CURRENT_TIMESTAMP
  `).all(uni);
  const busySet = new Set(busyRooms.map((r) => Number(r.room_id)));

  const seats_total = rooms.reduce((s, r) => s + n(r.capacity), 0) + halls.reduce((s, r) => s + n(r.capacity), 0);
  const rooms_busy = rooms.filter((r) => busySet.has(Number(r.id))).length;
  const labs = rooms.filter((r) => String(r.room_type || '').includes('lab'));
  const labs_busy = labs.filter((r) => busySet.has(Number(r.id))).length;

  const tickets = await db.prepare(`
    SELECT id, title, location, priority, status, created_at
    FROM maintenance_work_orders
    WHERE university_id = ?
      AND lower(status) NOT IN ('closed', 'done', 'resolved', 'cancelled')
    ORDER BY
      CASE WHEN lower(priority) = 'high' THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 12
  `).all(uni);

  const disrupting = tickets.filter((t) => {
    const loc = `${t.location || ''} ${t.title || ''}`.toLowerCase();
    return /hall|lab|قاعة|مختبر|classroom|ac |hvac|it |network|projector/.test(loc);
  });

  return {
    tuition: {
      currency: plans[0]?.currency || 'USD',
      plans: plans.length,
      due,
      collected,
      remaining,
      collection_rate,
      by_admission,
    },
    facilities: {
      rooms: rooms.length,
      halls: halls.length,
      labs: labs.length,
      rooms_busy,
      labs_busy,
      seats_total,
      occupancy_rate: rooms.length ? Math.round((rooms_busy / rooms.length) * 1000) / 10 : 0,
      items: [
        ...rooms.map((r) => ({
          kind: r.room_type || 'room',
          name: r.name,
          building: r.building,
          capacity: n(r.capacity),
          busy: busySet.has(Number(r.id)),
        })),
        ...halls.map((r) => ({
          kind: 'exam_hall',
          name: r.name,
          building: r.building,
          capacity: n(r.capacity),
          busy: false,
        })),
      ],
    },
    tickets: {
      open: tickets.length,
      disrupting: disrupting.length,
      items: tickets.map((t) => ({
        id: t.id,
        title: t.title,
        location: t.location,
        priority: t.priority,
        status: t.status,
        disrupting: disrupting.some((d) => d.id === t.id),
      })),
    },
  };
}
