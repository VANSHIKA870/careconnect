const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { deleteEventForUser } = require('../services/calendar');
const { queueEmail } = require('../services/email');

const router = express.Router();

// Apply auth middleware to all admin endpoints
router.use(authenticateToken);
router.use(requireRole(['ADMIN']));

// 1. GET /api/admin/doctors - List all doctors
router.get('/doctors', async (req, res) => {
  try {
    const doctors = await prisma.user.findMany({
      where: { role: 'DOCTOR' },
      include: {
        doctorProfile: {
          include: {
            workingHours: true,
            leaveDays: true,
          },
        },
      },
    });
    res.json(doctors);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. POST /api/admin/doctors - Create doctor
router.post('/doctors', async (req, res) => {
  const { email, password, fullName, phone, specialisation, slotDurationMin, bio } = req.body;

  if (!email || !password || !fullName || !phone) {
    return res.status(400).json({ error: 'Email, password, fullName, and phone are required' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const doctor = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'DOCTOR',
        fullName,
        phone,
        doctorProfile: {
          create: {
            specialisation: specialisation || 'General Physician',
            slotDurationMin: parseInt(slotDurationMin || '30'),
            bio: bio || '',
          },
        },
      },
      include: {
        doctorProfile: true,
      },
    });

    res.status(201).json(doctor);
  } catch (error) {
    console.error('Error creating doctor:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. PUT /api/admin/doctors/:id - Update doctor
router.put('/doctors/:id', async (req, res) => {
  const { id } = req.params;
  const { fullName, phone, specialisation, slotDurationMin, bio } = req.body;

  try {
    const docId = parseInt(id);
    const doctor = await prisma.user.update({
      where: { id: docId },
      data: {
        fullName,
        phone,
        doctorProfile: {
          update: {
            specialisation,
            slotDurationMin: slotDurationMin ? parseInt(slotDurationMin) : undefined,
            bio,
          },
        },
      },
      include: {
        doctorProfile: true,
      },
    });

    res.json(doctor);
  } catch (error) {
    console.error('Error updating doctor:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. DELETE /api/admin/doctors/:id - Delete doctor
router.delete('/doctors/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.user.delete({
      where: { id: parseInt(id) },
    });
    res.json({ message: 'Doctor deleted successfully' });
  } catch (error) {
    console.error('Error deleting doctor:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. POST /api/admin/doctors/:id/working-hours - Setup working hours
router.post('/doctors/:id/working-hours', async (req, res) => {
  const { id } = req.params;
  const { workingHours } = req.body; // Array of { dayOfWeek (0-6), startTime ("09:00"), endTime ("17:00") }

  if (!Array.isArray(workingHours)) {
    return res.status(400).json({ error: 'workingHours must be an array' });
  }

  try {
    const doctorId = parseInt(id);

    // Delete existing hours first to replace them
    await prisma.workingHour.deleteMany({ where: { doctorId } });

    // Create new hours
    const createdHours = await prisma.$transaction(
      workingHours.map((wh) =>
        prisma.workingHour.create({
          data: {
            doctorId,
            dayOfWeek: wh.dayOfWeek,
            startTime: wh.startTime,
            endTime: wh.endTime,
          },
        })
      )
    );

    res.json(createdHours);
  } catch (error) {
    console.error('Error setting working hours:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. POST /api/admin/doctors/:id/leave - Mark Leave day & resolve conflict
router.post('/doctors/:id/leave', async (req, res) => {
  const { id } = req.params;
  const { date } = req.body; // e.g. "2026-07-04"

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  try {
    const doctorId = parseInt(id);
    const leaveDate = new Date(date);
    leaveDate.setUTCHours(0, 0, 0, 0); // Normalize to midnight UTC

    // Save leave day
    let leaveDay;
    try {
      leaveDay = await prisma.leaveDay.create({
        data: {
          doctorId,
          date: leaveDate,
        },
      });
    } catch (e) {
      if (e.code === 'P2002') {
        return res.status(400).json({ error: 'Doctor is already marked on leave for this date' });
      }
      throw e;
    }

    // Doctor details for email/calendar lookup
    const doctorUser = await prisma.user.findUnique({
      where: { id: doctorId },
    });

    // Query all CONFIRMED appointments on that day
    const startOfDay = new Date(leaveDate);
    const endOfDay = new Date(leaveDate);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    const affectedAppointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        status: 'CONFIRMED',
        slotStart: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      include: {
        patient: {
          include: {
            user: true,
          },
        },
      },
    });

    let affectedCount = 0;

    for (const appt of affectedAppointments) {
      // 1. Update status to RESCHED_NEEDED
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { status: 'RESCHED_NEEDED' },
      });

      // 2. Queue LEAVE_CONFLICT email
      const patientUser = appt.patient.user;
      const apptDateStr = appt.slotStart.toLocaleString();
      const subject = `Urgent: CareConnect appointment update - Reschedule needed`;
      const bodyHtml = `
        <h2>Dear ${patientUser.fullName},</h2>
        <p>We regret to inform you that Dr. ${doctorUser.fullName} is unavailable on <strong>${leaveDate.toDateString()}</strong>.</p>
        <p>Your appointment originally scheduled at <strong>${apptDateStr}</strong> needs to be rescheduled.</p>
        <p>Please log into your CareConnect patient portal to choose another slot at your earliest convenience.</p>
        <p>We apologise for the inconvenience caused.</p>
        <hr />
        <p>CareConnect Medical Team</p>
      `;

      await queueEmail(appt.id, patientUser.email, 'LEAVE_CONFLICT', subject, bodyHtml);

      // 3. Delete Google Calendar events (try/catch - non-fatal)
      try {
        if (appt.patientCalendarEventId) {
          await deleteEventForUser(patientUser, appt.patientCalendarEventId);
        }
      } catch (err) {
        console.error(`[Google Calendar] Could not delete patient calendar event:`, err.message);
      }

      try {
        if (appt.doctorCalendarEventId) {
          await deleteEventForUser(doctorUser, appt.doctorCalendarEventId);
        }
      } catch (err) {
        console.error(`[Google Calendar] Could not doctor calendar event:`, err.message);
      }

      affectedCount++;
    }

    res.json({
      message: `Leave day created. ${affectedCount} affected appointments rescheduled.`,
      leaveDay,
      affectedPatientsCount: affectedCount,
    });
  } catch (error) {
    console.error('Error setting leave:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 7. DELETE /api/admin/doctors/:id/leave - Cancel Leave
router.delete('/doctors/:id/leave', async (req, res) => {
  const { id } = req.params;
  const { date } = req.body; // e.g. "2026-07-04"

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  try {
    const doctorId = parseInt(id);
    const leaveDate = new Date(date);
    leaveDate.setUTCHours(0, 0, 0, 0);

    await prisma.leaveDay.delete({
      where: {
        doctorId_date: {
          doctorId,
          date: leaveDate,
        },
      },
    });

    res.json({ message: 'Leave date cancelled successfully' });
  } catch (error) {
    console.error('Error deleting leave:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 8. GET /api/admin/appointments - Get all appointments
router.get('/appointments', async (req, res) => {
  try {
    const appointments = await prisma.appointment.findMany({
      include: {
        patient: {
          include: { user: true },
        },
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

// 9. GET /api/admin/stats - System stats
router.get('/stats', async (req, res) => {
  try {
    const totalDoctors = await prisma.user.count({ where: { role: 'DOCTOR' } });
    const totalPatients = await prisma.user.count({ where: { role: 'PATIENT' } });
    const totalAppointments = await prisma.appointment.count();

    const highUrgency = await prisma.appointment.count({ where: { symptomUrgency: 'High' } });
    const medUrgency = await prisma.appointment.count({ where: { symptomUrgency: 'Medium' } });
    const lowUrgency = await prisma.appointment.count({ where: { symptomUrgency: 'Low' } });

    const statusCounts = await prisma.appointment.groupBy({
      by: ['status'],
      _count: {
        _all: true,
      },
    });

    res.json({
      totalDoctors,
      totalPatients,
      totalAppointments,
      urgency: {
        High: highUrgency,
        Medium: medUrgency,
        Low: lowUrgency,
      },
      statuses: statusCounts.reduce((acc, current) => {
        acc[current.status] = current._count._all;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error('Error gathering admin stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
