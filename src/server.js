import 'dotenv/config';

import express from 'express';
import cors from 'cors';

import connectDB from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import labourRoutes from './routes/labourerRoutes.js';
import labourBookingRoutes from './routes/labourBookingRoutes.js';

const app = express();

app.use(cors());

app.use(express.json());

connectDB();

app.use('/api/auth', authRoutes);

app.use('/api/labourers', labourRoutes);
app.use('/api/labour-bookings', labourBookingRoutes);

app.get('/api/health', (req, res) =>
  res.status(200).json({ success: true, message: 'KhetiMaster API is running' })
);

app.get('/', (req, res) => res.json({ success: true, message: 'Welcome to KhetiMaster API' }));

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => console.log(`KhetiMaster server running on port ${PORT}`));
