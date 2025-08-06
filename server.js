const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const chatRoutes = require('./routes/chat');

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
  credentials: true
}));
app.use(express.json());
app.use('/api', chatRoutes); // Ensure this line is present

const port = process.env.PORT || 5000;

connectDB().catch(err => {
  console.error('Failed to connect to MongoDB:', err.message);
});

// For local testing
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

module.exports = app; // Export for Vercel serverless