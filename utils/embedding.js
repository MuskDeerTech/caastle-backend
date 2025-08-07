// utils/embedding.js

const use = require('@tensorflow-models/universal-sentence-encoder');
const tf = require('@tensorflow/tfjs'); // use this, not tfjs-node

let model;

const loadModel = async () => {
  if (!model) {
    model = await use.load();
    console.log("✅ USE model loaded (tfjs)");
  }
  return model;
};

const getEmbedding = async (text) => {
  const model = await loadModel();
  const embeddings = await model.embed([text]);
  const array = await embeddings.array();
  return array[0]; // return single vector
};

module.exports = {
  getEmbedding,
};
