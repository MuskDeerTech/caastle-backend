// utils/embedding.js
const use = require('@tensorflow-models/universal-sentence-encoder');
const tf = require('@tensorflow/tfjs-node');

let model = null;

async function loadModel() {
  if (!model) {
    model = await use.load();
  }
  return model;
}

async function getEmbedding(text) {
  const model = await loadModel();
  const embeddings = await model.embed([text]);
  const array = await embeddings.array();
  return array[0];
}

module.exports = { getEmbedding };
