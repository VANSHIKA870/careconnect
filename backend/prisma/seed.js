const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Reset data (optional but good for seed clean runs)
  await prisma.emailJob.deleteMany({});
  await prisma.medicationReminder.deleteMany({});
  await prisma.slotHold.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.leaveDay.deleteMany({});
  await prisma.workingHour.deleteMany({});
  await prisma.doctorProfile.deleteMany({});
  await prisma.patientProfile.deleteMany({});
  await prisma.user.deleteMany({});

  const adminPassword = bcrypt.hashSync('Admin@123', 10);
  const doctorPassword = bcrypt.hashSync('Doctor@123', 10);
  const patientPassword = bcrypt.hashSync('Patient@123', 10);

  // 1. Admin
  await prisma.user.create({
    data: {
      email: 'admin@careconnect.com',
      passwordHash: adminPassword,
      role: 'ADMIN',
      fullName: 'CareConnect Admin',
      phone: '+15550001',
    },
  });

  // 2. Cardiologist (Dr. Sharma)
  const drSharma = await prisma.user.create({
    data: {
      email: 'dr.sharma@careconnect.com',
      passwordHash: doctorPassword,
      role: 'DOCTOR',
      fullName: 'Dr. Rajesh Sharma',
      phone: '+15550002',
      doctorProfile: {
        create: {
          specialisation: 'Cardiologist',
          slotDurationMin: 30,
          bio: 'Dr. Sharma has over 15 years of experience treating complex heart conditions. He is passionate about preventive cardiology.',
        },
      },
    },
  });

  // 3. General Physician (Dr. Patel)
  const drPatel = await prisma.user.create({
    data: {
      email: 'dr.patel@careconnect.com',
      passwordHash: doctorPassword,
      role: 'DOCTOR',
      fullName: 'Dr. Anita Patel',
      phone: '+15550003',
      doctorProfile: {
        create: {
          specialisation: 'General Physician',
          slotDurationMin: 30,
          bio: 'Dr. Patel focuses on comprehensive adult healthcare, physical wellness, and managing chronic medical conditions.',
        },
      },
    },
  });

  // 4. Paediatrician (Dr. Jones)
  const drJones = await prisma.user.create({
    data: {
      email: 'dr.jones@careconnect.com',
      passwordHash: doctorPassword,
      role: 'DOCTOR',
      fullName: 'Dr. Sarah Jones',
      phone: '+15550004',
      doctorProfile: {
        create: {
          specialisation: 'Paediatrician',
          slotDurationMin: 30,
          bio: 'Dr. Jones is a pediatric care specialist dedicated to keeping children happy, healthy, and growing strong from birth to adolescence.',
        },
      },
    },
  });

  // 5. Patient (patient@careconnect.com)
  await prisma.user.create({
    data: {
      email: 'patient@careconnect.com',
      passwordHash: patientPassword,
      role: 'PATIENT',
      fullName: 'John Doe',
      phone: '+15550005',
      patientProfile: {
        create: {
          dateOfBirth: new Date('1990-05-15T00:00:00Z'),
          emergencyContact: 'Jane Doe (+15550006)',
        },
      },
    },
  });

  // Seed working hours for the doctors (Monday to Friday, 9:00 AM to 5:00 PM)
  const doctorIds = [drSharma.id, drPatel.id, drJones.id];
  for (const docId of doctorIds) {
    for (let day = 1; day <= 5; day++) {
      await prisma.workingHour.create({
        data: {
          doctorId: docId,
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '17:00',
        },
      });
    }
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
