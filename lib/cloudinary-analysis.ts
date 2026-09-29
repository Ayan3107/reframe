import { filterCloudinaryObjectLabels } from "./cloudinary-labels.mjs";

export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null
    ? (value as JsonObject)
    : {};
}

export function extractCaption(result: JsonObject): string {
  const info = asObject(result.info);
  const detection = asObject(info.detection);
  const captioning = asObject(
    detection.captioning ?? result.captioning,
  );
  const captionData = asObject(captioning.data);
  const caption = captionData.caption ?? captioning.caption;

  if (typeof caption === "string" && caption.trim()) return caption.trim();

  const rootCaptioning = asObject(result.captioning);
  const rootCaption = rootCaptioning.caption ?? asObject(rootCaptioning.data).caption;
  const rootDetectionCaption = asObject(asObject(result.detection).captioning).caption;
  const alternateCaption = rootCaption ?? rootDetectionCaption;
  return typeof alternateCaption === "string" && alternateCaption.trim()
    ? alternateCaption.trim()
    : "No caption available.";
}

export function extractObjects(result: JsonObject): string[] {
  const data = asObject(result.data);
  const analysis = asObject(data.analysis);
  const coco = asObject(data.coco);

  const info = asObject(result.info);
  const detection = asObject(info.detection);

  const objectDetection = asObject(
    detection.object_detection,
  );

  const objectData = asObject(objectDetection.data);
  const objectCoco = asObject(objectData.coco);

  const detectedCoco = asObject(
    detection.coco ?? detection.coco_v2,
  );

  const cocoData = asObject(detectedCoco.data);
  const nestedCoco = asObject(cocoData.coco);

  const tags =
    analysis.tags ??
    asObject(analysis.coco).tags ??
    coco.tags ??
    objectCoco.tags ??
    asObject(objectData.object_detection).tags ??
    asObject(asObject(objectData.object_detection).data).tags ??
    nestedCoco.tags ??
    detectedCoco.tags ??
    result.tags ??
    [];

  const labels = Array.isArray(tags)
    ? tags.map((item: unknown) =>
        typeof item === "string"
          ? item
          : typeof item === "object" && item !== null
            ? (item as JsonObject).name ??
              (item as JsonObject).label ??
              (item as JsonObject).tag
            : null,
      )
    : tags && typeof tags === "object"
      ? Object.keys(tags)
      : [];

  return filterCloudinaryObjectLabels(labels);
}

export function extractQuality(result: JsonObject): {
  quality: "high" | "medium" | "low" | "unknown";
  score: number | null;
} {
  const info = asObject(result.info);
  const detection = asObject(info.detection);
  const iqa = asObject(detection.iqa);
  const iqaData = asObject(asObject(iqa.data).iqa);
  const tags = asObject(iqa.tags);
  const objectDetection = asObject(detection.object_detection);
  const objectDetectionData = asObject(objectDetection.data);
  const nestedIqa = asObject(objectDetectionData.iqa);
  const nestedIqaTags = asObject(nestedIqa.tags);

  const iqaTag = asObject(
    Array.isArray(tags["iqa-analysis"])
      ? tags["iqa-analysis"][0]
      : undefined,
  );

  const attributes = asObject(iqaTag.attributes);
  const nestedIqaTag = asObject(
    Array.isArray(nestedIqaTags["iqa-analysis"])
      ? nestedIqaTags["iqa-analysis"][0]
      : undefined,
  );
  const nestedAttributes = asObject(nestedIqaTag.attributes);

  const raw = result.quality_analysis;
  const qualityData = asObject(raw);

  const sources = [
    nestedAttributes,
    nestedIqa,
    attributes,
    iqaData,
    iqa,
    qualityData,
  ];

  const foundScore = sources
    .map((source) => source.score)
    .find((value) => typeof value === "number" && Number.isFinite(value));

  const score =
    typeof raw === "number"
      ? raw
      : typeof foundScore === "number"
        ? foundScore
        : typeof qualityData.focus === "number" && Number.isFinite(qualityData.focus)
          ? qualityData.focus
          : null;

  const explicitQuality = sources.find(
    (source) => typeof source.quality === "string",
  )?.quality;

  const quality = score !== null
    ? score >= 0.75
      ? "high"
      : score >= 0.5
        ? "medium"
        : "low"
    : explicitQuality === "high" || explicitQuality === "medium" || explicitQuality === "low"
      ? explicitQuality
      : "unknown";

  return {
    quality,
    score,
  };
}
