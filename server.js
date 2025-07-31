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
app.use('/api', chatRoutes);

const port = process.env.PORT || 3000;

connectDB().catch(err => {
  console.error('Failed to connect to MongoDB:', err.message);
});

app.listen(port, () => console.log(`Server running on port ${port}`));