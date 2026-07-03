# CareConnect 💙

CareConnect is a premium, fully-accessible full-stack Healthcare Appointment Manager designed for Patients, Doctors, and Admins. Built with **Node.js + Express**, **React + Tailwind CSS**, and **PostgreSQL + Prisma**, it features JWT-based role authentication, automated Google Calendar synchronisation, Claude 3.5 Sonnet AI summaries, queue-based notifications, and strict accessibility standards.

---

## Table of Contents
1. [System Design Write-Up](#system-design-write-up)
2. [Prisma Database Schema](#prisma-database-schema)
3. [API Documentation](#api-documentation)
4. [AI Prompts & Claude Integration](#ai-prompts--claude-integration)
5. [Google Calendar Integration](#google-calendar-integration)
6. [Local Development & Setup Guide](#local-development--setup-guide)
7. [Production Deployment Instructions](#production-deployment-instructions)

---

## System Design Write-Up

### 1. Double-Booking Prevention (3 Layers of Safety)
To guarantee that two patients cannot book the same doctor slot at the same time, CareConnect implements a 3-layer scheduling guard:
*   **Layer 1: Pre-booking SlotHold:** When a patient selects a slot, a `SlotHold` record is created in the database, valid for 5 minutes. Other patients cannot hold or book this slot while it is active. The frontend shows a countdown timer.
*   **Layer 2: SELECT FOR UPDATE Transaction Lock:** During the final booking transaction, the database locks the target doctor's record (`SELECT * FROM "DoctorProfile" WHERE "userId" = ? FOR UPDATE`). This serializes concurrent booking requests for that doctor. The system then re-verifies that the slot has not been filled before inserting the appointment.
*   **Layer 3: Database Unique Constraint:** The `Appointment` table enforces a database-level composite unique constraint: `@@unique([doctorId, slotStart])`. If a race condition somehow slips past the other layers, the database will throw a unique constraint error (Prisma `P2002`), which is caught by the backend to return a polite, human-readable notification: *"That time is already taken — please pick another."*

### 2. Doctor Leave Conflicts
When an Administrator schedules a doctor's leave:
1.  A new `LeaveDay` is recorded, and the date is normalized to midnight UTC.
2.  The system queries all `CONFIRMED` appointments scheduled with that doctor on that day.
3.  Each affected appointment is updated to `RESCHED_NEEDED` status.
4.  A `LEAVE_CONFLICT` email job is queued in the database for each patient.
5.  Associated Google Calendar events are deleted for both the patient and doctor (wrapped in try/catch so network/auth failure is non-fatal).
6.  The API returns the count of affected appointments to the Admin dashboard.

### 3. Slot Holds Flow
1.  **Select Slot:** Patient selects a time slot → `POST /api/patient/slots/hold` creates a `SlotHold` with `expiresAt = now + 5 min`.
2.  **Countdown:** The frontend displays a 5-minute timer.
3.  **Cron Cleanup:** A background cron job runs every 1 minute to delete expired holds.
4.  **Verification:** On final booking (`POST /api/patient/appointments`), the backend verifies the hold exists, matches the logged-in patient, and has not expired.
5.  **Release:** If the patient clicks "Back" or selects a different slot, the hold is released immediately via `DELETE /api/patient/slots/hold`.

### 4. Queue-Based Email System (No Fire-and-Forget)
Rather than executing asynchronous email calls directly during API requests (which fail if the mail server goes down), CareConnect writes all notifications to the `EmailJob` table first with a `PENDING` status.
*   **Cron Processor:** Every 5 minutes, a cron job processes pending and failed email jobs.
*   **Exponential Backoff:** If a job fails, the attempts counter increments, and the next attempt is scheduled with backoff intervals:
    *   1st Failure: Retry in 5 minutes
    *   2nd Failure: Retry in 15 minutes
    *   3rd Failure: Retry in 30 minutes
    *   4th Failure: Retry in 1 hour
    *   5th Failure: Retry in 2 hours
*   **Abandonment:** After 5 failed attempts, the job status is set to `ABANDONED`, and a critical system warning is logged.

### 5. Google Calendar OAuth Sync
*   **Flow:** Patients and Doctors can link their Google Calendar. The OAuth token exchange is triggered via `/api/auth/google`.
*   **Refresh Token Rotation:** Access and Refresh tokens are stored in the `User` record. The Google API client listens for `'tokens'` events, rotating and updating the database credentials automatically.
*   **Resilience:** All Calendar operations (Insert, Update, Delete) are wrapped in try/catch blocks. If a sync fails, the error is logged, but the core booking/cancellation flow succeeds.

---

## Prisma Database Schema

Below is the entity structure defined in `schema.prisma`:

```prisma
enum Role {
  ADMIN
  DOCTOR
  PATIENT
}

model User {
  id                 Int             @id @default(autoincrement())
  email              String          @unique
  passwordHash       String
  role               Role
  fullName           String
  phone              String
  googleAccessToken  String?
  googleRefreshToken String?
  patientProfile     PatientProfile?
  doctorProfile      DoctorProfile?
}

model PatientProfile {
  userId               Int                  @id
  dateOfBirth          DateTime
  emergencyContact     String
  user                 User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  appointments         Appointment[]
  slotHolds            SlotHold[]
  medicationReminders  MedicationReminder[]
}

model DoctorProfile {
  userId          Int           @id
  specialisation  String
  slotDurationMin Int           @default(30)
  bio             String
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  workingHours    WorkingHour[]
  leaveDays       LeaveDay[]
  appointments    Appointment[]
  slotHolds       SlotHold[]
}

model WorkingHour {
  id        Int           @id @default(autoincrement())
  doctorId  Int
  dayOfWeek Int           // 0-6
  startTime String        // "HH:MM"
  endTime   String        // "HH:MM"
  doctor    DoctorProfile @relation(fields: [doctorId], references: [userId], onDelete: Cascade)
}

model LeaveDay {
  id       Int           @id @default(autoincrement())
  doctorId Int
  date     DateTime      // midnight UTC
  doctor   DoctorProfile @relation(fields: [doctorId], references: [userId], onDelete: Cascade)
  @@unique([doctorId, date])
}

model Appointment {
  id                     Int                  @id @default(autoincrement())
  patientId              Int
  doctorId               Int
  slotStart              DateTime
  slotEnd                DateTime
  status                 String               // PENDING, CONFIRMED, RESCHED_NEEDED, COMPLETED, CANCELLED
  symptomText            String
  symptomUrgency         String               // Low, Medium, High
  symptomSummary         String?              // JSON structure
  symptomLLMFailed       Boolean              @default(false)
  doctorNotes            String?
  prescription           String?
  postVisitSummary       String?              // JSON structure
  postVisitLLMFailed     Boolean              @default(false)
  patientCalendarEventId String?
  doctorCalendarEventId  String?
  patient                PatientProfile       @relation(fields: [patientId], references: [userId], onDelete: Cascade)
  doctor                 DoctorProfile        @relation(fields: [doctorId], references: [userId], onDelete: Cascade)
  medicationReminders    MedicationReminder[]
  emailJobs              EmailJob[]
  @@unique([doctorId, slotStart])
}

model SlotHold {
  id        Int            @id @default(autoincrement())
  doctorId  Int
  slotStart DateTime
  patientId Int
  expiresAt DateTime
  doctor    DoctorProfile  @relation(fields: [doctorId], references: [userId], onDelete: Cascade)
  patient   PatientProfile @relation(fields: [patientId], references: [userId], onDelete: Cascade)
  @@unique([doctorId, slotStart])
}

model MedicationReminder {
  id              Int            @id @default(autoincrement())
  appointmentId   Int
  patientId       Int
  medicationName  String
  dosage          String
  frequencyPerDay Int
  durationDays    Int
  startDate       DateTime
  nextReminderAt  DateTime
  active          Boolean        @default(true)
  appointment     Appointment    @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  patient         PatientProfile @relation(fields: [patientId], references: [userId], onDelete: Cascade)
}

model EmailJob {
  id            Int          @id @default(autoincrement())
  appointmentId Int?
  toEmail       String
  type          String       // BOOKING_CONFIRMATION, REMINDER_24H, CANCELLATION, LEAVE_CONFLICT, MEDICATION_REMINDER
  subject       String
  bodyHtml      String
  status        String       // PENDING, SENT, FAILED, ABANDONED
  attempts      Int          @default(0)
  maxAttempts   Int          @default(5)
  nextAttemptAt DateTime
  appointment   Appointment? @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
}
```

---

## API Documentation

### Authentication Routes
*   `POST /api/auth/register` - Registers a patient or doctor.
*   `POST /api/auth/login` - Authenticates credentials; returns user profile, role, access token, and refresh token.
*   `POST /api/auth/refresh` - Issues a new access token using a refresh token.
*   `POST /api/auth/logout` - Discards the session.
*   `GET /api/auth/google?userId=...` - Redirects to Google consent screen for Calendar access.
*   `GET /api/auth/google/callback` - OAuth authorization callback handler.

### Admin Routes (Requires role `ADMIN`)
*   `GET /api/admin/doctors` - Lists all doctor accounts, working hours, and leave schedules.
*   `POST /api/admin/doctors` - Creates a new doctor user profile.
*   `PUT /api/admin/doctors/:id` - Updates a doctor's details.
*   `DELETE /api/admin/doctors/:id` - Removes a doctor.
*   `POST /api/admin/doctors/:id/working-hours` - Configures weekly schedule parameters.
*   `POST /api/admin/doctors/:id/leave` - Marks a leave date, updates conflicted appointments, calendar entries, and queues patient emails.
*   `DELETE /api/admin/doctors/:id/leave` - Removes a leave date.
*   `GET /api/admin/appointments` - Displays all scheduled appointments across the system.
*   `GET /api/admin/stats` - Pulls analytics for the global system dashboard.

### Patient Routes (Requires role `PATIENT`)
*   `GET/PUT /api/patient/profile` - Manages patient personal information.
*   `GET /api/patient/doctors` - Searches doctors by specialisation.
*   `GET /api/patient/doctors/:id/slots?date=` - Shows availability (AVAILABLE, BOOKED, HELD) on a date.
*   `POST /api/patient/slots/hold` - Claims a 5-minute hold on a slot.
*   `DELETE /api/patient/slots/hold` - Releases a slot hold.
*   `POST /api/patient/appointments` - Validates the hold and books the slot (incorporates Claude pre-visit summary and SELECT FOR UPDATE).
*   `GET /api/patient/appointments` - Lists all appointments.
*   `GET/DELETE/PUT /api/patient/appointments/:id` - Views, cancels, or reschedules an appointment.
*   `GET /api/patient/appointments/:id/post-visit` - Pulls simplified patient-friendly notes and schedules.
*   `GET /api/patient/medications` - Returns active medications and daily alarms.

### Doctor Routes (Requires role `DOCTOR`)
*   `GET/PUT /api/doctor/profile` - Manages professional details.
*   `GET /api/doctor/appointments` - Pulls the daily schedule (filterable by date and status).
*   `GET /api/doctor/appointments/:id` - Detailed view (includes symptom text, AI pre-visit insights, and internal clinical notes form).
*   `PUT /api/doctor/appointments/:id/notes` - Saves clinical notes drafts.
*   `PUT /api/doctor/appointments/:id/complete` - Completes the appointment, triggers the Claude post-visit parser, and schedules medication alarms.
*   `GET /api/doctor/stats` - Pulls analytics for the doctor dashboard.

---

## AI Prompts & Claude Integration

We integrate with **Claude 3.5 Sonnet** (via the Anthropic Node SDK). The service code is stored in `backend/src/services/claude.js`.

### 1. Pre-Visit Symptom Prompt
Used to evaluate raw symptom logs when booking:
```
Analyse these symptoms and return JSON with: urgency (Low/Medium/High), chiefComplaint (one sentence), suggestedQuestions (array of 3). Return ONLY valid JSON. Symptoms: {symptomText}
```

### 2. Post-Visit Translation Prompt
Used to translate clinical notes into easy-to-read instructions when completing consultations:
```
Convert these clinical notes into patient-friendly JSON with: summary (2-3 simple sentences), medicationSchedule (array of {name, dosage, timing, instructions}), followUpSteps (array), followUpDate. Simple words only, no jargon. Notes: {doctorNotes} Prescription: {prescription}
```

### 3. Fail-Safe Handling
If the Claude API returns an error or rate limit, the request is caught safely:
*   The system sets `symptomLLMFailed = true` (or `postVisitLLMFailed = true`).
*   It populates the DB with a standard fallback structure so the doctor can still view the raw text.
*   The patient's booking and consultation completion flows are **never** blocked.

---

## Google Calendar Integration

To enable synchronization, set up a Google Cloud Console project:
1.  Go to the **Google Cloud Console**.
2.  Create a project and enable the **Google Calendar API**.
3.  Go to the **OAuth Consent Screen**, set User Type to *External*, and add test users.
4.  Create **OAuth 2.0 Client Credentials**.
5.  Set the Redirect URI to: `http://localhost:5000/api/auth/google/callback` (or your production URL).
6.  Copy client ID and secret parameters into backend `.env`.

*Note: In local testing, if these keys are left empty, the application automatically bypasses API calls, logging details to console and creating mock events so the flow operates smoothly.*

---

## Local Development & Setup Guide

### 1. Backend Setup
1.  Navigate to `backend/`.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Open `.env` and fill in configuration variables.
    *Note: For a quick local SQLite test, change the database config in `prisma/schema.prisma` to:*
    ```prisma
    datasource db {
      provider = "sqlite"
      url      = "file:./dev.db"
    }
    ```
4.  Generate Prisma Client:
    ```bash
    npx prisma generate
    ```
5.  Deploy database schema:
    ```bash
    npx prisma migrate dev --name init
    ```
6.  Seed the database with default profiles:
    ```bash
    npm run prisma:seed
    ```
7.  Start server:
    ```bash
    npm run dev
    ```

### 2. Frontend Setup
1.  Navigate to `frontend/`.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start development server:
    ```bash
    npm run dev
    ```
4.  Open `http://localhost:3000` in your web browser.

---

## Production Deployment Instructions

### Backend (Render.com)
1.  Create a **PostgreSQL** database on Render.
2.  Create a new **Web Service**, linking your repository.
3.  Set base path to `backend/`.
4.  Add environment variables:
    *   `DATABASE_URL` (from Render Postgres)
    *   `JWT_SECRET`, `JWT_REFRESH_SECRET`
    *   `ANTHROPIC_API_KEY`
    *   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
    *   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
    *   `FRONTEND_URL` (URL of Vercel frontend)
5.  Set build command:
    ```bash
    npm install && npx prisma generate && npx prisma migrate deploy
    ```
6.  Set start command:
    ```bash
    node src/index.js
    ```

### Frontend (Vercel)
1.  Import your repository into Vercel.
2.  Configure root directory to `frontend/`.
3.  Leave the default framework setting as **Vite**.
4.  Deploy.
