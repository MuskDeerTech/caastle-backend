const { getEmbedding } = require("../utils/embedding");

router.post("/upload", upload.single("file"), async (req, res) => {
  // Extract text from file (already done)
  const text = await extractTextFromFile(req.file.path);

  const embedding = await getEmbedding(text);

  const newDoc = new Document({
    text,
    embedding
  });

  await newDoc.save();
  res.status(200).json({ message: "Document uploaded and indexed" });
});
