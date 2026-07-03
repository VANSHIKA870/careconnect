const { google } = require('googleapis');
const prisma = require('../prisma');

function getOAuthClient() {
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect_uri = process.env.GOOGLE_REDIRECT_URI;

  if (!client_id || !client_secret || !redirect_uri) {
    return null;
  }

  return new google.auth.OAuth2(client_id, client_secret, redirect_uri);
}

// Set up event listener for tokens and store them in DB
function getAuthenticatedClient(user) {
  const oauthClient = getOAuthClient();
  if (!oauthClient) return null;

  if (!user.googleRefreshToken) {
    return null; // Not authenticated with Google
  }

  oauthClient.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });

  oauthClient.on('tokens', async (tokens) => {
    try {
      const updateData = {};
      if (tokens.access_token) {
        updateData.googleAccessToken = tokens.access_token;
      }
      if (tokens.refresh_token) {
        updateData.googleRefreshToken = tokens.refresh_token;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
        console.log(`[Google Calendar] Tokens rotated successfully for user ${user.id}`);
      }
    } catch (err) {
      console.error(`[Google Calendar] Error saving rotated tokens for user ${user.id}:`, err);
    }
  });

  return oauthClient;
}

async function createEventForUser(user, otherUser, appointment, isDoctor) {
  try {
    const auth = getAuthenticatedClient(user);
    if (!auth) {
      console.log(`[Google Calendar] User ${user.email} has not linked Google Calendar. Skipping event creation.`);
      return `mock-event-${isDoctor ? 'doctor' : 'patient'}-${appointment.id}`;
    }

    const calendar = google.calendar({ version: 'v3', auth });
    const summary = isDoctor 
      ? `CareConnect: Appt with Patient ${otherUser.fullName}` 
      : `CareConnect: Appt with Dr. ${otherUser.fullName}`;

    const description = `CareConnect Healthcare Appointment.\nPatient symptoms: ${appointment.symptomText}\nUrgency: ${appointment.symptomUrgency}`;

    const event = {
      summary,
      description,
      start: {
        dateTime: appointment.slotStart.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: appointment.slotEnd.toISOString(),
        timeZone: 'UTC',
      },
      attendees: [
        { email: user.email },
        { email: otherUser.email }
      ],
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    console.log(`[Google Calendar] Created event for user ${user.email}: ${response.data.id}`);
    return response.data.id;
  } catch (error) {
    console.error(`[Google Calendar] Failed to create event for user ${user.email}:`, error.message);
    return `failed-event-${isDoctor ? 'doctor' : 'patient'}-${appointment.id}`;
  }
}

async function deleteEventForUser(user, eventId) {
  if (!eventId || eventId.startsWith('mock-') || eventId.startsWith('failed-')) {
    return;
  }
  try {
    const auth = getAuthenticatedClient(user);
    if (!auth) return;

    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });
    console.log(`[Google Calendar] Deleted event ${eventId} for user ${user.email}`);
  } catch (error) {
    console.error(`[Google Calendar] Failed to delete event ${eventId} for user ${user.email}:`, error.message);
  }
}

async function updateEventForUser(user, otherUser, appointment, eventId, isDoctor) {
  if (!eventId || eventId.startsWith('mock-') || eventId.startsWith('failed-')) {
    // If it was a mock/failed event, let's try to create it anew in case they linked it now
    return await createEventForUser(user, otherUser, appointment, isDoctor);
  }
  try {
    const auth = getAuthenticatedClient(user);
    if (!auth) return eventId;

    const calendar = google.calendar({ version: 'v3', auth });
    const summary = isDoctor 
      ? `CareConnect: Appt with Patient ${otherUser.fullName} (Rescheduled)` 
      : `CareConnect: Appt with Dr. ${otherUser.fullName} (Rescheduled)`;

    const event = {
      summary,
      start: {
        dateTime: appointment.slotStart.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: appointment.slotEnd.toISOString(),
        timeZone: 'UTC',
      },
    };

    const response = await calendar.events.patch({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: event,
    });

    console.log(`[Google Calendar] Updated event ${eventId} for user ${user.email}`);
    return response.data.id;
  } catch (error) {
    console.error(`[Google Calendar] Failed to update event ${eventId} for user ${user.email}:`, error.message);
    return eventId;
  }
}

module.exports = {
  createEventForUser,
  deleteEventForUser,
  updateEventForUser,
  getOAuthClient
};
