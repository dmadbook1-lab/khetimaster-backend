import 'dotenv/config';

import express from 'express';
import cors from 'cors';

import connectDB from './config/db.js';

import authRoutes from './routes/authRoutes.js';

import labourRoutes from './routes/labourerRoutes.js';
import labourBookingRoutes from './routes/labourBookingRoutes.js';

import machineryRoutes from './routes/machineryRoutes.js';
import machineryBookingRoutes from './routes/machineryBookingRoutes.js';

import doctorRoutes from './routes/doctorRoutes.js';
import doctorConsultationRoutes from './routes/doctorConsultationRoutes.js';

import articleRoutes from './routes/articleRoutes.js';
import mandiRoutes from './routes/mandiRoutes.js';

import nurseryRoutes from './routes/nurseryRoutes.js';
import nurseryCartRoutes from './routes/nurseryCartRoutes.js';
import nurseryOrderRoutes from './routes/nurseryOrderRoutes.js';

import { startArticleRefreshJob } from './jobs/articleRefreshJob.js';

import { refreshArticles } from './services/articleService.js';

const app = express();

/*
 * Middleware
 */
app.use(cors());

app.use(express.json());

/*
 * Database
 */
connectDB();

/*
 * Authentication
 */
app.use('/api/auth', authRoutes);

/*
 * Labour
 */
app.use('/api/labourers', labourRoutes);

app.use('/api/labour-bookings', labourBookingRoutes);

/*
 * Machinery
 */
app.use('/api/machinery', machineryRoutes);

app.use('/api/machinery-bookings', machineryBookingRoutes);

/*
 * Doctors
 */
app.use('/api/doctors', doctorRoutes);

app.use('/api/doctor-consultations', doctorConsultationRoutes);

/*
 * Agriculture Articles
 */
app.use('/api/articles', articleRoutes);

app.use('/api/mandi', mandiRoutes);

app.use('/api/nursery', nurseryRoutes);

app.use('/api/nursery/cart', nurseryCartRoutes);

app.use('/api/nursery/orders', nurseryOrderRoutes);

/*
 * Health Check
 */
app.get('/api/health', (req, res) =>
  res.status(200).json({
    success: true,
    message: 'KhetiMaster API is running',
  })
);

/*
 * Root Route
 */
app.get('/', (req, res) =>
  res.json({
    success: true,
    message: 'Welcome to KhetiMaster API',
  })
);

/*
 * Server
 */
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KhetiMaster server running on port ${PORT}`);

  /*
   * Start automatic article refresh.
   *
   * Articles will be refreshed according
   * to ARTICLE_REFRESH_MINUTES in .env
   * (30 minutes by default).
   */
  startArticleRefreshJob();

  /*
   * Initial article refresh.
   *
   * Without this, a fresh MongoDB database
   * would remain empty until the first
   * scheduled 30-minute refresh.
   *
   * Wait 3 seconds so that MongoDB connection
   * has time to establish.
   */
  setTimeout(async () => {
    try {
      console.log('Initial article refresh started...');

      const result = await refreshArticles();

      console.log('Initial article refresh completed:', result);
    } catch (error) {
      console.error('Initial article refresh failed:', error);
    }
  }, 3000);
});
