const cron = require('node-cron');
const prisma = require('../prisma');
const { processEmailQueue, queueEmail } = require('../services/email');

function initCronJobs() {
  console.log('[Cron] Initialising background cron jobs...');

  // 1. Every 1 min: delete expired SlotHolds
  cron.schedule('*/1 * * * *', async () => {
    try {
      const now = new Date();
      const deleted = await prisma.slotHold.deleteMany({
        where: {
          expiresAt: { lt: now }
        }
      });
      if (deleted.count > 0) {
        console.log(`[Cron] Cleared ${deleted.count} expired slot holds.`);
      }
    } catch (error) {
      console.error('[Cron] Error clearing expired slot holds:', error);
    }
  });

  // 2. Every 5 min: retry pending/failed EmailJobs with backoff
  cron.schedule('*/5 * * * *', async () => {
    try {
      await processEmailQueue();
    } catch (error) {
      console.error('[Cron] Error running email queue processor:', error);
    }
  });

  // 3. Every 30 min: send due MedicationReminders and schedule next
  cron.schedule('*/30 * * * *', async () => {
    try {
      const now = new Date();
      // Find all active reminders that are due
      const dueReminders = await prisma.medicationReminder.findMany({
        where: {
          active: true,
          nextReminderAt: { lte: now }
        },
        include: {
          patient: {
            include: {
              user: true
            }
          }
        }
      });

      for (const reminder of dueReminders) {
        const patientEmail = reminder.patient.user.email;
        const patientName = reminder.patient.user.fullName;

        // Calculate end date based on duration
        const durationMs = reminder.durationDays * 24 * 60 * 60 * 1000;
        const endDate = new Date(reminder.startDate.getTime() + durationMs);

        if (now >= endDate) {
          // Deactivate reminder since duration is complete
          await prisma.medicationReminder.update({
            where: { id: reminder.id },
            data: { active: false }
          });
          console.log(`[Cron] Medication reminder ${reminder.id} (${reminder.medicationName}) reached duration limit. Deactivated.`);
          continue;
        }

        // Send reminder email
        const subject = `CareConnect: Time to take your medicine — ${reminder.medicationName}`;
        const bodyHtml = `
          <h2>Hello, ${patientName}</h2>
          <p>This is a friendly reminder to take your medication.</p>
          <p><strong>Medicine Name:</strong> ${reminder.medicationName}</p>
          <p><strong>Dosage:</strong> ${reminder.dosage}</p>
          <p><strong>Instructions:</strong> Take as per frequency ${reminder.frequencyPerDay} time(s) a day.</p>
          <hr />
          <p>Thank you for choosing CareConnect!</p>
        `;

        await queueEmail(reminder.appointmentId, patientEmail, 'MEDICATION_REMINDER', subject, bodyHtml);

        // Schedule next reminder: 24h / frequency
        const intervalHours = 24 / reminder.frequencyPerDay;
        const nextReminder = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

        await prisma.medicationReminder.update({
          where: { id: reminder.id },
          data: {
            nextReminderAt: nextReminder
          }
        });
        console.log(`[Cron] Medication reminder ${reminder.id} sent and next scheduled for ${nextReminder}`);
      }
    } catch (error) {
      console.error('[Cron] Error running medication reminders:', error);
    }
  });

  // 4. Every 1 hour: queue REMINDER_24H emails for appointments starting in 24h
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();
      const targetStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
      const targetEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000); // 2-hour window to catch them safely

      const appointments = await prisma.appointment.findMany({
        where: {
          status: 'CONFIRMED',
          slotStart: {
            gte: targetStart,
            lte: targetEnd
          }
        },
        include: {
          patient: {
            include: {
              user: true
            }
          },
          doctor: {
            include: {
              user: true
            }
          }
        }
      });

      for (const appt of appointments) {
        // Check if 24h reminder is already queued
        const existingJob = await prisma.emailJob.findFirst({
          where: {
            appointmentId: appt.id,
            type: 'REMINDER_24H'
          }
        });

        if (existingJob) continue;

        const patientEmail = appt.patient.user.email;
        const patientName = appt.patient.user.fullName;
        const docName = appt.doctor.user.fullName;
        const dateStr = appt.slotStart.toLocaleString();

        const subject = `CareConnect: Appointment Reminder in 24 hours`;
        const bodyHtml = `
          <h2>Hello, ${patientName}</h2>
          <p>This is a reminder that you have an upcoming appointment in 24 hours.</p>
          <p><strong>Doctor:</strong> Dr. ${docName}</p>
          <p><strong>Time:</strong> ${dateStr}</p>
          <p>If you need to reschedule or cancel, please log in to your CareConnect dashboard.</p>
          <hr />
          <p>CareConnect Support Team</p>
        `;

        await queueEmail(appt.id, patientEmail, 'REMINDER_24H', subject, bodyHtml);
        console.log(`[Cron] Queued 24h reminder for Appointment ID ${appt.id}`);
      }
    } catch (error) {
      console.error('[Cron] Error queuing 24h reminders:', error);
    }
  });

  console.log('[Cron] Background jobs scheduled.');
}

module.exports = { initCronJobs };
