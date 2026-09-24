import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";
import {
  asObject,
  extractCaption,
  extractObjects,
  extractQuality,
} from "@/lib/cloudinary-analysis";
import { isEvidencePublicId } from "@/lib/cloudinary-config";
import { filterCloudinaryObjectLabels } from "../../../lib/cloudinary-labels.mjs";
import { safeServerError } from "@/lib/server-error";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function parseStoredObjects(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return filterCloudinaryObjectLabels(parsed);
    }
  } catch {
    return filterCloudinaryObjectLabels(value.split(","));
  }
  return [];
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const publicId = typeof asObject(body).public_id === "string"
      ? asObject(body).public_id as string
      : "";
    if (!isEvidencePublicId(publicId)) {
      return NextResponse.json(
        { success: false, error: "Choose a valid RE:FRAME record." },
        { status: 400 },
      );
    }

    const resource = asObject(await cloudinary.api.resource(publicId, {
      context: true,
      tags: true,
    }));
    const existingContext = asObject(resource.context);
    const existingObjects = parseStoredObjects(existingContext.reframe_objects);
    const assetTags = filterCloudinaryObjectLabels(resource.tags);

    let caption = "No caption generated.";
    let objects: string[] = [];
    let quality = { quality: "unknown", score: null as number | null };
    let objectAnalysisError: string | null = null;
    let qualityAnalysisError: string | null = null;

    try {
      const cocoResult = asObject(await cloudinary.api.update(publicId, {
        type: "upload",
        detection: "coco",
        auto_tagging: 0.3,
      }));
      caption = extractCaption(cocoResult);
      objects = extractObjects(cocoResult);
    } catch (error) {
      objectAnalysisError = "Cloudinary could not return object labels for this image.";
      console.error(
        "RE:FRAME existing asset COCO analysis failed:",
        safeServerError(error),
      );
    }

    try {
      const iqaResult = asObject(await cloudinary.api.update(publicId, {
        type: "upload",
        detection: "iqa",
      }));
      quality = extractQuality(iqaResult);
      if (quality.quality === "unknown" && quality.score === null) {
        qualityAnalysisError = "Cloudinary did not return a quality score for this image.";
      }
    } catch (error) {
      qualityAnalysisError = "Cloudinary could not return an image quality score.";
      console.error(
        "RE:FRAME existing asset IQA analysis failed:",
        safeServerError(error),
      );
    }

    const savedCaption = caption === "No caption generated."
      ? (typeof existingContext.reframe_caption === "string"
          ? existingContext.reframe_caption
          : "No caption generated.")
      : caption;
    const savedObjects = objects.length > 0
      ? objects
      : existingObjects.length > 0
        ? existingObjects
        : assetTags;
    if (quality.quality === "unknown" && typeof existingContext.reframe_quality === "string") {
      const storedScore = existingContext.reframe_quality_score;
      const parsedScore = typeof storedScore === "string" && storedScore !== ""
        ? Number(storedScore)
        : null;
      quality = {
        quality: existingContext.reframe_quality,
        score: parsedScore !== null && Number.isFinite(parsedScore) ? parsedScore : null,
      };
    }

    const analyzedAt = new Date().toISOString();
    const addContext = cloudinary.uploader.add_context as unknown as (
      context: Record<string, string>,
      publicIds: string[],
    ) => Promise<unknown>;
    await addContext(
      {
        reframe_type: "visual_record",
        reframe_caption: savedCaption.slice(0, 450),
        reframe_objects: JSON.stringify(savedObjects),
        reframe_quality: quality.quality,
        reframe_quality_score: quality.score?.toString() ?? "",
        reframe_analyzed_at: analyzedAt,
        reframe_category: typeof existingContext.reframe_category === "string"
          ? existingContext.reframe_category
          : "Unsorted",
      },
      [publicId],
    );

    return NextResponse.json({
      success: true,
      intelligence: {
        caption: savedCaption,
        objects: savedObjects,
        quality: quality.quality,
        quality_score: quality.score,
        analyzed_at: analyzedAt,
        object_analysis_error: objectAnalysisError,
        quality_analysis_error: qualityAnalysisError,
      },
    });
  } catch (error) {
    console.error(
      "RE:FRAME stored asset analysis failed:",
      safeServerError(error),
    );
    return NextResponse.json(
      {
        success: false,
        error: "Could not analyze this saved image. Your original Cloudinary asset is unchanged.",
      },
      { status: 500 },
    );
  }
}
