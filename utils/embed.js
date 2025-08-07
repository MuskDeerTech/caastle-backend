const use = require('@tensorflow-models/universal-sentence-encoder');
const tf = require('@tensorflow/tfjs-node');

let model;

async function loadModel() {
  if (!model) {
    model = await use.load();
  }
  return model;
}

async function generateEmbedding(text) {
  const model = await loadModel();
  const embeddings = await model.embed([text]);
  const array = await embeddings.array();
  return array[0]; // return 512-dimensional vector
}

module.exports = { generateEmbedding };
