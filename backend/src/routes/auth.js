const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { getOAuthClient } = require('../services/calendar');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-access-token-key-12345';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-token-key-67890';

// Generate token helper functions
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, fullName, phone, role, ...profileDetails } = req.body;

  if (!email || !password || !fullName || !phone || !role) {
    return res.status(400).json({ error: 'All fields (email, password, fullName, phone, role) are required' });
  }

  if (!['ADMIN', 'DOCTOR', 'PATIENT'].includes(role.toUpperCase())) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const roleUpper = role.toUpperCase();

    // Create User and specific Profile using transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: roleUpper,
          fullName,
          phone,
        },
      });

      if (roleUpper === 'PATIENT') {
        const dateOfBirth = profileDetails.dateOfBirth ? new Date(profileDetails.dateOfBirth) : new Date();
        const emergencyContact = profileDetails.emergencyContact || 'None';
        await tx.patientProfile.create({
          data: {
            userId: newUser.id,
            dateOfBirth,
            emergencyContact,
          },
        });
      } else if (roleUpper === 'DOCTOR') {
        await tx.doctorProfile.create({
          data: {
            userId: newUser.id,
            specialisation: profileDetails.specialisation || 'General Physician',
            slotDurationMin: parseInt(profileDetails.slotDurationMin || '30'),
            bio: profileDetails.bio || '',
          },
        });
      }

      return newUser;
    });

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        patientProfile: true,
        doctorProfile: true,
      },
    });

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        phone: user.phone,
        googleLinked: !!user.googleRefreshToken,
        profile: user.role === 'PATIENT' ? user.patientProfile : (user.role === 'DOCTOR' ? user.doctorProfile : null),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    const accessToken = generateAccessToken(user);
    res.json({ accessToken });
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.json({ message: 'Logout successful' });
});

// GET /api/auth/google
router.get('/google', (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).send('userId is required');
  }

  const oauthClient = getOAuthClient();
  if (!oauthClient) {
    // fallback redirection for testing
    console.log(`[Google OAuth] Mocking auth link for user ${userId}`);
    const mockRedirect = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?google_success=mocked&userId=${userId}`;
    return res.redirect(mockRedirect);
  }

  const url = oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
    state: userId,
  });

  res.redirect(url);
});

// GET /api/auth/google/callback
router.get('/google/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  const oauthClient = getOAuthClient();

  if (!oauthClient) {
    // If redirect returns to callback and no client, send back as mock
    const targetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?google_success=mocked&userId=${userId}`;
    return res.redirect(targetUrl);
  }

  try {
    const { tokens } = await oauthClient.getToken(code);
    
    // Save tokens in user record
    await prisma.user.update({
      where: { id: parseInt(userId) },
      data: {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token, // usually present only on first consent
      },
    });

    const successRedirect = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?google_success=true`;
    res.redirect(successRedirect);
  } catch (error) {
    console.error('[Google OAuth] Error retrieving token:', error);
    const failureRedirect = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?google_success=false&error=${encodeURIComponent(error.message)}`;
    res.redirect(failureRedirect);
  }
});

module.exports = router;
