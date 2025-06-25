const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const userRoutes = require('./routes/user');

dotenv.config();
const app = express();

// Normalize origin to remove trailing slashes
const normalizeOrigin = (origin) => origin?.replace(/\/$/, '');

// CORS configuration
const allowedOrigins = [
  normalizeOrigin(process.env.CLIENT_URI), // e.g., https://secure-vault-beta.vercel.app
  normalizeOrigin(process.env.CLIENT_URI_DEV), // e.g., http://localhost:3000
].filter(Boolean);

// Apply CORS for public routes separately
app.use('/api/files/public', cors({
  origin: '*', // Allow all origins for public routes
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// Apply CORS for authenticated routes
app.use(
  cors({
    origin: (origin, callback) => {
      const normalizedOrigin = normalizeOrigin(origin);
      if (!origin || allowedOrigins.includes(normalizedOrigin)) {
        callback(null, normalizedOrigin || true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Parse JSON bodies
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/users', userRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  res.status(500).json({ message: 'Server error.' });
});

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));