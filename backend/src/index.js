require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initCronJobs } = require('./jobs/cron');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const patientRoutes = require('./routes/patient');
const doctorRoutes = require('./routes/doctor');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Body parser
app.use(express.json());

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/doctor', doctorRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Express Global Error]:', err);
  res.status(500).json({ error: 'An unexpected server error occurred' });
});

// Start the server and cron jobs
app.listen(PORT, () => {
  console.log(`==========================================`);
  console.log(`CareConnect backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`==========================================`);
  
  // Start node-cron background tasks
  initCronJobs();
});
