const nodemailer = require('nodemailer');
const prisma = require('../prisma');

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || user === 'smtp-username' || !pass || pass === 'smtp-password') {
    return null; // Mock mode
  }

  return nodemailer.createTransport({
    host,
    port,
    auth: { user, pass },
  });
}

function getBackoffMinutes(attempts) {
  if (attempts === 1) return 5;
  if (attempts === 2) return 15;
  if (attempts === 3) return 30;
  if (attempts === 4) return 60;
  return 120; // 5 or more
}

async function queueEmail(appointmentId, toEmail, type, subject, bodyHtml) {
  try {
    const job = await prisma.emailJob.create({
      data: {
        appointmentId,
        toEmail,
        type,
        subject,
        bodyHtml,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
      },
    });
    console.log(`[Email Queue] Queued ${type} email to ${toEmail}. Job ID: ${job.id}`);
    return job;
  } catch (error) {
    console.error('[Email Queue] Failed to queue email:', error);
  }
}

async function processEmailQueue() {
  console.log('[Email Queue] Processing email jobs...');
  const now = new Date();

  // Find jobs that are PENDING or FAILED, and scheduled to run now
  const jobs = await prisma.emailJob.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      nextAttemptAt: { lte: now },
      attempts: { lt: 5 },
    },
    take: 50, // Process in batches
  });

  if (jobs.length === 0) {
    console.log('[Email Queue] No emails to send.');
    return;
  }

  const transporter = getTransporter();

  for (const job of jobs) {
    console.log(`[Email Queue] Attempting to send Job ID ${job.id} (Type: ${job.type}, To: ${job.toEmail}, Attempt: ${job.attempts + 1})`);
    
    try {
      if (!transporter) {
        // Mock SMTP mode
        console.log(`\n--- [MOCK EMAIL SENT] ---`);
        console.log(`To: ${job.toEmail}`);
        console.log(`Subject: ${job.subject}`);
        console.log(`Type: ${job.type}`);
        console.log(`Body:\n${job.bodyHtml}`);
        console.log(`-------------------------\n`);
      } else {
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || 'noreply@careconnect.com',
          to: job.toEmail,
          subject: job.subject,
          html: job.bodyHtml,
        });
      }

      // Mark as SENT
      await prisma.emailJob.update({
        where: { id: job.id },
        data: {
          status: 'SENT',
          attempts: job.attempts + 1,
        },
      });
      console.log(`[Email Queue] Job ID ${job.id} sent successfully.`);
    } catch (error) {
      const nextAttempts = job.attempts + 1;
      const backoffMin = getBackoffMinutes(nextAttempts);
      const nextAttemptAt = new Date(Date.now() + backoffMin * 60 * 1000);
      const status = nextAttempts >= job.maxAttempts ? 'ABANDONED' : 'FAILED';

      await prisma.emailJob.update({
        where: { id: job.id },
        data: {
          status,
          attempts: nextAttempts,
          nextAttemptAt,
        },
      });

      if (status === 'ABANDONED') {
        console.error(`🚨 [Email Queue Alert] Job ID ${job.id} to ${job.toEmail} has failed after maximum attempts and is ABANDONED. Error:`, error.message);
      } else {
        console.warn(`[Email Queue] Job ID ${job.id} failed. Rescheduling in ${backoffMin} min. Error:`, error.message);
      }
    }
  }
}

module.exports = {
  queueEmail,
  processEmailQueue
};
