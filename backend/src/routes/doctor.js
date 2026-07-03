const express = require('express');
const prisma = require('../prisma');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { analyzePostVisit } = require('../services/claude');

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole(['DOCTOR']));

// 1. GET /api/doctor/profile - Get profile details
router.get('/profile', async (req, res) => {
  try {
    const profile = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        doctorProfile: {
          include: {
            workingHours: true,
            leaveDays: true,
          },
        },
      },
    });
    res.json(profile);
  } catch (error) {
    console.error('Error fetching doctor profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/doctor/profile - Update profile details
router.put('/profile', async (req, res) => {
  const { fullName, phone, specialisation, slotDurationMin, bio } = req.body;
  try {
    const updated = await prisma.user.update({
      where: { id: req.user.id },
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
    res.json(updated);
  } catch (error) {
    console.error('Error updating doctor profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. GET /api/doctor/appointments - Get schedule (date & status optional filters)
router.get('/appointments', async (req, res) => {
  const { date, status } = req.query; // date format: YYYY-MM-DD
  const doctorId = req.user.id;

  try {
    const whereClause = { doctorId };

    if (status) {
      whereClause.status = status;
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);

      whereClause.slotStart = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        patient: {
          include: { user: true },
        },
      },
      orderBy: { slotStart: 'asc' },
    });

    res.json(appointments);
  } catch (error) {
    console.error('Error fetching doctor appointments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. GET /api/doctor/appointments/:id - Individual detail
router.get('/appointments/:id', async (req, res) => {
  const { id } = req.params;
  const doctorId = req.user.id;

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: parseInt(id) },
      include: {
        patient: {
          include: { user: true },
        },
      },
    });

    if (!appointment || appointment.doctorId !== doctorId) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json(appointment);
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. PUT /api/doctor/appointments/:id/notes - Add notes and prescription
router.put('/appointments/:id/notes', async (req, res) => {
  const { id } = req.params;
  const { doctorNotes, prescription } = req.body;
  const doctorId = req.user.id;

  try {
    const apptId = parseInt(id);
    const appointment = await prisma.appointment.findUnique({
      where: { id: apptId },
    });

    if (!appointment || appointment.doctorId !== doctorId) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const updated = await prisma.appointment.update({
      where: { id: apptId },
      data: {
        doctorNotes,
        prescription,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating notes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: Guess frequency per day from text timing (e.g. "Morning and Evening" -> 2, "Daily" -> 1)
function estimateFrequency(timingText) {
  const text = (timingText || '').toLowerCase();
  if (text.includes('three') || text.includes('3 times') || text.includes('tds') || text.includes('morning, afternoon, evening')) {
    return 3;
  }
  if (text.includes('twice') || text.includes('two') || text.includes('2 times') || text.includes('bd') || text.includes('morning and evening') || text.includes('morning and night')) {
    return 2;
  }
  if (text.includes('four') || text.includes('4 times')) {
    return 4;
  }
  return 1; // Default daily
}

// 5. PUT /api/doctor/appointments/:id/complete - Complete appointment & process post-visit summary
router.put('/appointments/:id/complete', async (req, res) => {
  const { id } = req.params;
  const { doctorNotes, prescription } = req.body;
  const doctorId = req.user.id;

  if (!doctorNotes || !prescription) {
    return res.status(400).json({ error: 'Doctor clinical notes and prescription are required to complete the appointment' });
  }

  try {
    const apptId = parseInt(id);
    const appointment = await prisma.appointment.findUnique({
      where: { id: apptId },
    });

    if (!appointment || appointment.doctorId !== doctorId) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Call Claude post-visit simplifier
    const llmResult = await analyzePostVisit(doctorNotes, prescription);

    // Save details and mark COMPLETED
    const completedAppt = await prisma.appointment.update({
      where: { id: apptId },
      data: {
        status: 'COMPLETED',
        doctorNotes,
        prescription,
        postVisitSummary: JSON.stringify(llmResult.data),
        postVisitLLMFailed: !llmResult.success,
      },
    });

    // Create MedicationReminders if medicationSchedule is present in Claude result
    const schedule = llmResult.data.medicationSchedule || [];
    const patientId = appointment.patientId;
    const now = new Date();

    for (const med of schedule) {
      const freq = estimateFrequency(med.timing);
      const intervalHours = 24 / freq;
      const nextReminder = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

      // Extract duration or default to 7 days
      let durationDays = 7;
      const inst = (med.instructions || '').toLowerCase() + ' ' + (med.timing || '').toLowerCase();
      const durationMatch = inst.match(/(\d+)\s*day/);
      if (durationMatch) {
        durationDays = parseInt(durationMatch[1]);
      }

      await prisma.medicationReminder.create({
        data: {
          appointmentId: apptId,
          patientId,
          medicationName: med.name,
          dosage: med.dosage,
          frequencyPerDay: freq,
          durationDays,
          startDate: now,
          nextReminderAt: nextReminder,
          active: true,
        },
      });
    }

    res.json(completedAppt);
  } catch (error) {
    console.error('Error completing appointment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. GET /api/doctor/stats - Doctor stats dashboard
router.get('/stats', async (req, res) => {
  const doctorId = req.user.id;
  try {
    const total = await prisma.appointment.count({ where: { doctorId } });
    const completed = await prisma.appointment.count({ where: { doctorId, status: 'COMPLETED' } });
    const confirmed = await prisma.appointment.count({ where: { doctorId, status: 'CONFIRMED' } });
    const cancelled = await prisma.appointment.count({ where: { doctorId, status: 'CANCELLED' } });

    const highUrgency = await prisma.appointment.count({ where: { doctorId, symptomUrgency: 'High' } });
    const medUrgency = await prisma.appointment.count({ where: { doctorId, symptomUrgency: 'Medium' } });
    const lowUrgency = await prisma.appointment.count({ where: { doctorId, symptomUrgency: 'Low' } });

    res.json({
      total,
      completed,
      confirmed,
      cancelled,
      urgencyBreakdown: {
        High: highUrgency,
        Medium: medUrgency,
        Low: lowUrgency,
      },
    });
  } catch (error) {
    console.error('Error fetching doctor stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
