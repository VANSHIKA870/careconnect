const express = require('express');
const prisma = require('../prisma');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { analyzeSymptoms } = require('../services/claude');
const { createEventForUser, deleteEventForUser, updateEventForUser } = require('../services/calendar');
const { queueEmail } = require('../services/email');

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole(['PATIENT']));

// 1. GET /api/patient/profile - Get patient profile
router.get('/profile', async (req, res) => {
  try {
    const profile = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { patientProfile: true },
    });
    res.json(profile);
  } catch (error) {
    console.error('Error fetching patient profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/patient/profile - Update patient profile
router.put('/profile', async (req, res) => {
  const { fullName, phone, dateOfBirth, emergencyContact } = req.body;
  try {
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        fullName,
        phone,
        patientProfile: {
          update: {
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
            emergencyContact,
          },
        },
      },
      include: { patientProfile: true },
    });
    res.json(updated);
  } catch (error) {
    console.error('Error updating patient profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. GET /api/patient/doctors - Find doctors
router.get('/doctors', async (req, res) => {
  const { specialisation } = req.query;
  try {
    const doctors = await prisma.user.findMany({
      where: {
        role: 'DOCTOR',
        doctorProfile: specialisation ? {
          specialisation: {
            contains: specialisation,
            mode: 'insensitive',
          },
        } : {},
      },
      include: {
        doctorProfile: true,
      },
    });
    res.json(doctors);
  } catch (error) {
    console.error('Error searching doctors:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: Get slots on a date for a doctor
async function getDoctorSlotsForDate(doctorId, dateStr, patientId = null) {
  const targetDate = new Date(dateStr);
  const dayOfWeek = targetDate.getUTCDay(); // 0 (Sun) to 6 (Sat)

  // 1. Check if doctor is on leave
  const leave = await prisma.leaveDay.findFirst({
    where: {
      doctorId,
      date: {
        gte: new Date(targetDate.setUTCHours(0, 0, 0, 0)),
        lte: new Date(targetDate.setUTCHours(23, 59, 59, 999)),
      },
    },
  });

  if (leave) return [];

  // 2. Get working hours for this day of week
  const workingHours = await prisma.workingHour.findFirst({
    where: { doctorId, dayOfWeek },
  });

  if (!workingHours) return [];

  // 3. Get doctor's profile for slot duration
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorId },
  });
  const duration = profile ? profile.slotDurationMin : 30;

  // Build slots list
  const startHourStr = workingHours.startTime; // "HH:MM"
  const endHourStr = workingHours.endTime;

  const [startH, startM] = startHourStr.split(':').map(Number);
  const [endH, endM] = endHourStr.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  const now = new Date();
  const slots = [];

  // Get booked appointments for the day
  const startOfDay = new Date(dateStr);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(dateStr);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { notIn: ['CANCELLED', 'RESCHED_NEEDED'] },
      slotStart: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  // Get active SlotHolds for the day
  const holds = await prisma.slotHold.findMany({
    where: {
      doctorId,
      expiresAt: { gt: now },
      slotStart: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  for (let min = startMinutes; min < endMinutes; min += duration) {
    const slotTimeStart = new Date(dateStr);
    slotTimeStart.setUTCHours(Math.floor(min / 60), min % 60, 0, 0);

    const slotTimeEnd = new Date(slotTimeStart.getTime() + duration * 60 * 1000);

    // Skip past slots if target date is today
    if (slotTimeStart < now) continue;

    // Check if booked
    const isBooked = appointments.some(
      (a) => a.slotStart.getTime() === slotTimeStart.getTime()
    );

    // Check if held
    const hold = holds.find(
      (h) => h.slotStart.getTime() === slotTimeStart.getTime()
    );

    let availability = 'AVAILABLE';
    let heldByMe = false;

    if (isBooked) {
      availability = 'BOOKED';
    } else if (hold) {
      availability = 'HELD';
      if (patientId && hold.patientId === patientId) {
        heldByMe = true;
      }
    }

    slots.push({
      start: slotTimeStart,
      end: slotTimeEnd,
      status: availability,
      heldByMe,
      expiresAt: hold ? hold.expiresAt : null,
    });
  }

  return slots;
}

// 3. GET /api/patient/doctors/:id/slots?date=
router.get('/doctors/:id/slots', async (req, res) => {
  const { id } = req.params;
  const { date } = req.query; // e.g. "2026-07-04"

  if (!date) {
    return res.status(400).json({ error: 'Date query parameter is required' });
  }

  try {
    const slots = await getDoctorSlotsForDate(parseInt(id), date, req.user.id);
    res.json(slots);
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. POST /api/patient/slots/hold - Create SlotHold
router.post('/slots/hold', async (req, res) => {
  const { doctorId, slotStart } = req.body;

  if (!doctorId || !slotStart) {
    return res.status(400).json({ error: 'doctorId and slotStart are required' });
  }

  const patientId = req.user.id;
  const start = new Date(slotStart);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 min expiry

  try {
    const docId = parseInt(doctorId);
    
    // Check if slot is already booked
    const existingAppt = await prisma.appointment.findUnique({
      where: {
        doctorId_slotStart: { doctorId: docId, slotStart: start },
      },
    });

    if (existingAppt && existingAppt.status !== 'CANCELLED' && existingAppt.status !== 'RESCHED_NEEDED') {
      return res.status(400).json({ error: 'That slot is already booked.' });
    }

    // Check if hold already exists for this slot
    const existingHold = await prisma.slotHold.findUnique({
      where: {
        doctorId_slotStart: { doctorId: docId, slotStart: start },
      },
    });

    if (existingHold && existingHold.expiresAt > now) {
      if (existingHold.patientId === patientId) {
        // If held by same patient, renew hold
        const renewed = await prisma.slotHold.update({
          where: { id: existingHold.id },
          data: { expiresAt },
        });
        return res.json({ message: 'Hold renewed successfully', hold: renewed });
      }
      return res.status(409).json({ error: 'This time is already being held by another user. Please choose another time.' });
    }

    // Create or overwrite expired hold
    const hold = await prisma.slotHold.upsert({
      where: {
        doctorId_slotStart: { doctorId: docId, slotStart: start },
      },
      update: {
        patientId,
        expiresAt,
      },
      create: {
        doctorId: docId,
        slotStart: start,
        patientId,
        expiresAt,
      },
    });

    res.status(201).json({ message: 'Slot placed on hold for 5 minutes', hold });
  } catch (error) {
    console.error('Error holding slot:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/patient/slots/hold - Release SlotHold
router.delete('/slots/hold', async (req, res) => {
  const { doctorId, slotStart } = req.body;

  if (!doctorId || !slotStart) {
    return res.status(400).json({ error: 'doctorId and slotStart are required' });
  }

  try {
    const docId = parseInt(doctorId);
    const start = new Date(slotStart);

    const hold = await prisma.slotHold.findUnique({
      where: {
        doctorId_slotStart: { doctorId: docId, slotStart: start },
      },
    });

    if (!hold) {
      return res.json({ message: 'No hold existed for this slot' });
    }

    if (hold.patientId !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorised to release this hold' });
    }

    await prisma.slotHold.delete({ where: { id: hold.id } });
    res.json({ message: 'Hold released successfully' });
  } catch (error) {
    console.error('Error releasing slot:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. POST /api/patient/appointments - Book Appointment
router.post('/appointments', async (req, res) => {
  const { doctorId, slotStart, symptomText } = req.body;
  const patientId = req.user.id;

  if (!doctorId || !slotStart || !symptomText) {
    return res.status(400).json({ error: 'doctorId, slotStart, and symptom text are required' });
  }

  const docId = parseInt(doctorId);
  const start = new Date(slotStart);
  const now = new Date();

  // Get doctor profile slot duration for slot end calculation
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: docId },
  });
  const duration = profile ? profile.slotDurationMin : 30;
  const end = new Date(start.getTime() + duration * 60 * 1000);

  try {
    // 1. LAYER 1 PREVENTION: Check SlotHold belongs to this patient and hasn't expired
    const hold = await prisma.slotHold.findUnique({
      where: {
        doctorId_slotStart: { doctorId: docId, slotStart: start },
      },
    });

    if (!hold || hold.patientId !== patientId || hold.expiresAt < now) {
      return res.status(400).json({
        error: 'That time is already taken or your hold has expired — please pick another',
      });
    }

    // 2. LAYER 2 PREVENTION & Booking transaction
    // Call LLM pre-visit symptom analyzer (async but we don't let failures block booking)
    const llmResult = await analyzeSymptoms(symptomText);
    
    // We execute the booking in a Prisma transaction
    const newAppointment = await prisma.$transaction(async (tx) => {
      // Execute raw lock: SELECT FOR UPDATE on doctor record to prevent concurrency conflicts
      // This is Layer 2 locking.
      await tx.$queryRaw`SELECT * FROM "DoctorProfile" WHERE "userId" = ${docId} FOR UPDATE`;

      // Re-verify the slot hasn't been booked
      const existing = await tx.appointment.findUnique({
        where: {
          doctorId_slotStart: { doctorId: docId, slotStart: start },
        },
      });

      if (existing && existing.status !== 'CANCELLED' && existing.status !== 'RESCHED_NEEDED') {
        throw new Error('SLOT_TAKEN');
      }

      // Create appointment
      return await tx.appointment.create({
        data: {
          patientId,
          doctorId: docId,
          slotStart: start,
          slotEnd: end,
          status: 'CONFIRMED',
          symptomText,
          symptomUrgency: llmResult.data.urgency || 'UNKNOWN',
          symptomSummary: JSON.stringify(llmResult.data),
          symptomLLMFailed: !llmResult.success,
        },
      });
    });

    // Delete the slot hold now that appointment is confirmed
    await prisma.slotHold.delete({
      where: {
        doctorId_slotStart: { doctorId: docId, slotStart: start },
      },
    }).catch(() => {}); // ignore error if hold was already cleaned

    // Retrieve full patient & doctor user details for emails & calendars
    const patientUser = await prisma.user.findUnique({ where: { id: patientId } });
    const doctorUser = await prisma.user.findUnique({ where: { id: docId } });

    // Google Calendar events (try/catch wrapped - non-fatal)
    let patientCalEventId = null;
    let doctorCalEventId = null;

    try {
      patientCalEventId = await createEventForUser(patientUser, doctorUser, newAppointment, false);
    } catch (e) {
      console.error('[Google Calendar] Patient Event failed:', e.message);
    }

    try {
      doctorCalEventId = await createEventForUser(doctorUser, patientUser, newAppointment, true);
    } catch (e) {
      console.error('[Google Calendar] Doctor Event failed:', e.message);
    }

    // Save event IDs to appointment record
    const updatedAppt = await prisma.appointment.update({
      where: { id: newAppointment.id },
      data: {
        patientCalendarEventId: patientCalEventId,
        doctorCalendarEventId: doctorCalEventId,
      },
    });

    // Queue BOOKING_CONFIRMATION email
    const apptDateStr = start.toLocaleString();
    const subject = `Appointment Confirmed: CareConnect with Dr. ${doctorUser.fullName}`;
    const bodyHtml = `
      <h2>Appointment Confirmation</h2>
      <p>Dear ${patientUser.fullName},</p>
      <p>Your appointment has been successfully booked with <strong>Dr. ${doctorUser.fullName}</strong> (${profile.specialisation}).</p>
      <p><strong>Time:</strong> ${apptDateStr}</p>
      <p>We have added this to your Google Calendar.</p>
      <hr />
      <p>CareConnect Support Team</p>
    `;

    await queueEmail(updatedAppt.id, patientUser.email, 'BOOKING_CONFIRMATION', subject, bodyHtml);

    res.status(201).json(updatedAppt);
  } catch (error) {
    if (error.message === 'SLOT_TAKEN' || (error.code === 'P2002')) {
      // LAYER 3 PREVENTION: Catch P2002 or SLOT_TAKEN
      return res.status(409).json({
        error: 'That time is already taken — please pick another',
      });
    }
    console.error('Error booking appointment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. GET /api/patient/appointments - Get all patient appointments
router.get('/appointments', async (req, res) => {
  try {
    const appointments = await prisma.appointment.findMany({
      where: { patientId: req.user.id },
      include: {
        doctor: {
          include: { user: true },
        },
      },
      orderBy: { slotStart: 'desc' },
    });
    res.json(appointments);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/patient/appointments/:id - Detail
router.get('/appointments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: parseInt(id) },
      include: {
        doctor: {
          include: { user: true },
        },
      },
    });

    if (!appointment || appointment.patientId !== req.user.id) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json(appointment);
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/patient/appointments/:id - Cancel Appointment
router.delete('/appointments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const apptId = parseInt(id);
    const appointment = await prisma.appointment.findUnique({
      where: { id: apptId },
    });

    if (!appointment || appointment.patientId !== req.user.id) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Cancel appointment
    await prisma.appointment.update({
      where: { id: apptId },
      data: { status: 'CANCELLED' },
    });

    const patientUser = await prisma.user.findUnique({ where: { id: appointment.patientId } });
    const doctorUser = await prisma.user.findUnique({ where: { id: appointment.doctorId } });

    // Queue CANCELLATION email
    const apptDateStr = appointment.slotStart.toLocaleString();
    const subject = `Cancelled: CareConnect appointment with Dr. ${doctorUser.fullName}`;
    const bodyHtml = `
      <h2>Appointment Cancellation</h2>
      <p>Dear ${patientUser.fullName},</p>
      <p>Your appointment scheduled for <strong>${apptDateStr}</strong> with Dr. ${doctorUser.fullName} has been cancelled.</p>
      <p>If this was in error, please book a new slot on our portal.</p>
      <hr />
      <p>CareConnect Support Team</p>
    `;

    await queueEmail(apptId, patientUser.email, 'CANCELLATION', subject, bodyHtml);

    // Delete Google Calendar events
    if (appointment.patientCalendarEventId) {
      await deleteEventForUser(patientUser, appointment.patientCalendarEventId).catch(() => {});
    }
    if (appointment.doctorCalendarEventId) {
      await deleteEventForUser(doctorUser, appointment.doctorCalendarEventId).catch(() => {});
    }

    res.json({ message: 'Appointment cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/patient/appointments/:id - Reschedule
router.put('/appointments/:id', async (req, res) => {
  const { id } = req.params;
  const { slotStart } = req.body;

  if (!slotStart) {
    return res.status(400).json({ error: 'New slotStart is required' });
  }

  const patientId = req.user.id;
  const start = new Date(slotStart);

  try {
    const apptId = parseInt(id);
    const appointment = await prisma.appointment.findUnique({
      where: { id: apptId },
    });

    if (!appointment || appointment.patientId !== patientId) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const docId = appointment.doctorId;

    // Get doctor profile slot duration
    const profile = await prisma.doctorProfile.findUnique({
      where: { userId: docId },
    });
    const duration = profile ? profile.slotDurationMin : 30;
    const end = new Date(start.getTime() + duration * 60 * 1000);

    // Reschedule transaction
    const rescheduled = await prisma.$transaction(async (tx) => {
      // SELECT FOR UPDATE on doctor
      await tx.$queryRaw`SELECT * FROM "DoctorProfile" WHERE "userId" = ${docId} FOR UPDATE`;

      const existing = await tx.appointment.findUnique({
        where: {
          doctorId_slotStart: { doctorId: docId, slotStart: start },
        },
      });

      if (existing && existing.id !== apptId && existing.status !== 'CANCELLED' && existing.status !== 'RESCHED_NEEDED') {
        throw new Error('SLOT_TAKEN');
      }

      return await tx.appointment.update({
        where: { id: apptId },
        data: {
          slotStart: start,
          slotEnd: end,
          status: 'CONFIRMED', // reset to confirmed if it was resched_needed
        },
      });
    });

    const patientUser = await prisma.user.findUnique({ where: { id: patientId } });
    const doctorUser = await prisma.user.findUnique({ where: { id: docId } });

    // Update google calendar events
    let patientCalEventId = appointment.patientCalendarEventId;
    let doctorCalEventId = appointment.doctorCalendarEventId;

    if (patientCalEventId) {
      patientCalEventId = await updateEventForUser(patientUser, doctorUser, rescheduled, patientCalEventId, false).catch(() => null);
    }
    if (doctorCalEventId) {
      doctorCalEventId = await updateEventForUser(doctorUser, patientUser, rescheduled, doctorCalEventId, true).catch(() => null);
    }

    // Save event IDs if updated/re-created
    await prisma.appointment.update({
      where: { id: apptId },
      data: {
        patientCalendarEventId: patientCalEventId,
        doctorCalendarEventId: doctorCalEventId,
      },
    });

    // Queue confirmation email for rescheduling
    const apptDateStr = start.toLocaleString();
    const subject = `Appointment Rescheduled: CareConnect with Dr. ${doctorUser.fullName}`;
    const bodyHtml = `
      <h2>Appointment Rescheduled</h2>
      <p>Dear ${patientUser.fullName},</p>
      <p>Your appointment with <strong>Dr. ${doctorUser.fullName}</strong> has been successfully rescheduled.</p>
      <p><strong>New Time:</strong> ${apptDateStr}</p>
      <hr />
      <p>CareConnect Support Team</p>
    `;

    await queueEmail(apptId, patientUser.email, 'BOOKING_CONFIRMATION', subject, bodyHtml);

    res.json(rescheduled);
  } catch (error) {
    if (error.message === 'SLOT_TAKEN' || error.code === 'P2002') {
      return res.status(409).json({
        error: 'That time is already taken — please pick another',
      });
    }
    console.error('Error rescheduling appointment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 7. GET /api/patient/appointments/:id/post-visit - Simplified summary
router.get('/appointments/:id/post-visit', async (req, res) => {
  const { id } = req.params;
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: parseInt(id) },
    });

    if (!appointment || appointment.patientId !== req.user.id) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (!appointment.postVisitSummary) {
      return res.status(404).json({ error: 'Post-visit summary not available yet' });
    }

    res.json({
      summary: JSON.parse(appointment.postVisitSummary),
      notes: appointment.doctorNotes,
      prescription: appointment.prescription,
      llmFailed: appointment.postVisitLLMFailed,
    });
  } catch (error) {
    console.error('Error fetching post visit details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 8. GET /api/patient/medications - Get active medications reminders
router.get('/medications', async (req, res) => {
  try {
    const medications = await prisma.medicationReminder.findMany({
      where: {
        patientId: req.user.id,
        active: true,
      },
      include: {
        appointment: {
          include: {
            doctor: {
              include: { user: true },
            },
          },
        },
      },
    });
    res.json(medications);
  } catch (error) {
    console.error('Error fetching medications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
