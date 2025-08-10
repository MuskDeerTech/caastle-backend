const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const chatRoutes = require('./routes/chat');
const mongoose = require('mongoose');

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'https://caastle.netlify.app'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.options('*', cors());

app.use((req, res, next) => {
  if (req.method !== 'OPTIONS' && mongoose.connection.readyState !== 1) {
    connectDB()
      .then(() => {
        console.log('MongoDB connected successfully at 09:55 AM IST, August 09, 2025');
        next();
      })
      .catch(err => {
        console.error('DB connection error at 09:55 AM IST, August 09, 2025:', err.message);
        res.status(500).json({ error: 'Database connection failed' });
      });
  } else {
    next();
  }
});

app.use(express.json());

// Log all registered routes for debugging
app.use((req, res, next) => {
  console.log(`Registering route: ${req.path}`);
  next();
});

app.use('/api', chatRoutes);

const port = process.env.PORT || 5000;

connectDB().catch(err => {
  console.error('Failed to connect to MongoDB at 09:55 AM IST, August 09, 2025:', err.message);
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => console.log(`Server running on port ${port} at 09:55 AM IST, August 09, 2025`));
}

module.exports = app;