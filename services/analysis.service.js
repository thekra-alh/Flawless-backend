const axios = require(“axios”);
const FLASK_URL = process.env.FLASK_URL || “http://localhost:5000”;

async function analyzeImage(image) {
  if (!image || !Buffer.isBuffer(image)) {
    throw new Error(“A valid image buffer is required.”);
  }
  const FormData = require(“form-data”);
  const form = new FormData();
  form.append(“image”, image, { filename: “image.png”, contentType: “image/png” });
  const response = await axios.post(`${FLASK_URL}/predict`, form, {
    headers: form.getHeaders(),
    timeout: 30000,
  });
  const data = response.data;
  return {
    acneDetected: data.acneDetected,
    acneLevel: data.acneLevel,
    acneSeverityLevel: data.acneSeverityLevel,
    confidence: data.confidence,
  };
}

module.exports = { analyzeImage };
