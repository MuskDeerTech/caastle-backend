const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const chatRoutes = require('./routes/chat');

const app = express();
app.use(cors({ origin: 'https://caastle.netlify.app/' })); // Replace with your Netlify URL
app.use(express.json());
app.use('/api', chatRoutes);

const port = process.env.PORT || 3000; // Vercel assigns a port

connectDB().then(() => {
  app.listen(port, () => console.log(`Server running on port ${port}`));
});