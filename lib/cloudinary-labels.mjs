const SYSTEM_ANALYSIS_TAGS = new Set([
  "captioning",
  "coco",
  "iqa-analysis",
]);

export function filterCloudinaryObjectLabels(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const labels = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const label = item.trim();
    const normalized = label.toLowerCase();
    if (!label || SYSTEM_ANALYSIS_TAGS.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    labels.push(label);
  }

  return labels;
}
