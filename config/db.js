const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://muskdeer:nJWHN4xtdAKALCwc@cluster0.mg0yr.mongodb.net/chatbot?retryWrites=true&w=majority", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message, err.stack);
    process.exit(1); // Exit only if critical
  }
};

module.exports = connectDB;