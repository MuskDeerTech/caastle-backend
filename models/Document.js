const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  fileType: { type: String, required: true },
  embedding: { type: [Number], default: [] }, // <-- Add this
  uploadedBy: { type: String, default: 'admin' },
  uploadedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Document', documentSchema);
