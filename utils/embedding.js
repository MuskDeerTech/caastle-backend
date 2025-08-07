// utils/embedding.js
const use = require('@tensorflow-models/universal-sentence-encoder');
const tf = require('@tensorflow/tfjs'); // Use tfjs for node compatibility

let model;

const loadModel = async () => {
  if (!model) {
    model = await use.load();
    console.log('✅ USE model loaded (tfjs) at', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
  }
  return model;
};

const getEmbedding = async (text) => {
  if (!text || typeof text !== 'string') throw new Error('Invalid text input for embedding');
  const model = await loadModel();
  const embeddings = await model.embed([text]);
  const array = await embeddings.array();
  return array[0]; // Return the embedding vector
};

module.exports = {
  getEmbedding,
};