const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  chatHistory: [{ text: String, isBot: Boolean, timestamp: { type: Date, default: Date.now } }],
  lastUpdated: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);