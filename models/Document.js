const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  title: { type: String, required: true },  // e.g., "FAQs.pdf"
  content: { type: String, required: true },  // Extracted text
  fileType: { type: String, required: true },  // e.g., "pdf", "docx", "txt"
  uploadedBy: { type: String, default: 'admin' },  // Optional, for tracking
  uploadedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Document', documentSchema);