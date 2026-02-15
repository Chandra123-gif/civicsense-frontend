// src/services/aiValidation.js

import * as mobilenet from "@tensorflow-models/mobilenet";

let model = null;

// Issue keyword mapping
const ISSUE_KEYWORDS = {
  pothole: ['road', 'asphalt', 'pavement', 'street', 'highway', 'crack'],
  garbage: ['trash', 'garbage', 'dumpster', 'waste', 'litter', 'bin'],
  streetlight: ['street light', 'lamp post', 'traffic light', 'lamp'],
  water_leak: ['water', 'flood', 'pipe', 'leak', 'puddle'],
  damaged_road: ['road', 'bridge', 'sidewalk', 'debris'],
  other: []
};

// Load model once
export const loadModel = async () => {
  if (!model) {
    model = await mobilenet.load({ version: 2, alpha: 1.0 });
    console.log("✅ MobileNet model loaded");
  }
  return model;
};

// Validate image
export const validateImage = async (imageElement, issueType) => {
  if (!model) await loadModel();

  if (!issueType || issueType === "other") {
    return { isValid: true };
  }

  const predictions = await model.classify(imageElement);

  const keywords = ISSUE_KEYWORDS[issueType] || [];
  const topPrediction = predictions[0];

  const match = keywords.some(keyword =>
    topPrediction.className.toLowerCase().includes(keyword)
  );

  return {
    isValid: match,
    detectedLabel: topPrediction.className,
    confidence: (topPrediction.probability * 100).toFixed(2)
  };
};
