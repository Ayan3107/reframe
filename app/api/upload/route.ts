import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";
import {
  asObject,
  extractCaption,
  extractObjects,
  extractQuality,
  type JsonObject,
} from "@/lib/cloudinary-analysis";
import { getEvidenceFolder } from "@/lib/cloudinary-config";
import { safeServerError } from "@/lib/server-error";
import { getContentAddress, isExistingUpload } from "../../../lib/content-address.mjs";
import { filterCloudinaryObjectLabels } from "../../../lib/cloudinary-labels.mjs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function storedObjects(value: unknown): string[] {
  if (Array.isArray(value)) return filterCloudinaryObjectLabels(value);
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return filterCloudinaryObjectLabels(parsed);
  } catch {
    return filterCloudinaryObjectLabels(value.split(","));
  }
  return [];
}

function responseAsset(resource: JsonObject, publicId: string) {
  return {
    asset_id: stringValue(resource.asset_id),
    public_id: publicId,
    secure_url: stringValue(resource.secure_url),
    optimized_url: cloudinary.url(publicId, {
      secure: true,
      transformation: [
        { width: 1280, height: 1280, crop: "limit", quality: "auto", fetch_format: "auto" },
      ],
    }),
    resource_type: stringValue(resource.resource_type, "image"),
    format: stringValue(resource.format),
    width: Number(resource.width ?? 0),
    height: Number(resource.height ?? 0),
    bytes: Number(resource.bytes ?? 0),
    created_at: stringValue(resource.created_at),
  };
}

function readImageFile(request: Request): Promise<File | NextResponse> {
  return (async () => {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      return NextResponse.json(
        { success: false, error: "Send an image using the upload form." },
        { status: 400 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: "The upload form could not be read. Choose an image and try again." },
        { status: 400 },
      );
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file provided." },
        { status: 400 },
      );
    }
    if (!file.type.toLowerCase().startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "Only image files are supported." },
        { status: 400 },
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Choose an image smaller than 10 MB." },
        { status: 413 },
      );
    }
    return file;
  })();
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    const maxRequestBytes = MAX_IMAGE_BYTES + 256 * 1024;
    if (contentLength > maxRequestBytes) {
      return NextResponse.json(
        { success: false, error: "Choose an image smaller than 10 MB." },
        { status: 413 },
      );
    }

    const file = await readImageFile(request);
    if (file instanceof NextResponse) return file;

    const buffer = Buffer.from(await file.arrayBuffer());
    const folder = getEvidenceFolder();
    const contentAddress = getContentAddress(buffer);
    const uploadResult = await new Promise<JsonObject>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: contentAddress,
          overwrite: false,
          resource_type: "image",
          detection: "captioning",
          quality_analysis: true,
        },
        (error, result) => {
          if (error) reject(error);
          else if (result) resolve(result as JsonObject);
          else reject(new Error("Cloudinary returned no upload result."));
        },
      );
      stream.end(buffer);
    });

    const publicId = stringValue(uploadResult.public_id, `${folder}/${contentAddress}`);

    if (isExistingUpload(uploadResult)) {
      const existingAsset = asObject(await cloudinary.api.resource(publicId, {
        context: true,
        tags: true,
      }));
      const context = asObject(existingAsset.context);
      const tags = filterCloudinaryObjectLabels(existingAsset.tags);
      const objects = storedObjects(context.reframe_objects);
      const rawScore = context.reframe_quality_score;
      const parsedScore = rawScore === "" || rawScore === undefined ? null : Number(rawScore);
      const score = parsedScore !== null && Number.isFinite(parsedScore) ? parsedScore : null;

      return NextResponse.json({
        success: true,
        duplicate: true,
        asset: responseAsset(existingAsset, publicId),
        record: {
          title: stringValue(context.reframe_title),
          notes: stringValue(context.reframe_notes),
          category: stringValue(context.reframe_category, "Unsorted") || "Unsorted",
        },
        intelligence: {
          caption: stringValue(context.reframe_caption, "No caption available."),
          objects: objects.length > 0 ? objects : tags,
          object_count: objects.length > 0 ? objects.length : tags.length,
          object_analysis_error: null,
          quality_analysis_error: null,
          quality: stringValue(context.reframe_quality, "unknown"),
          quality_score: score,
          persistence_error: null,
          analyzed_at: stringValue(context.reframe_analyzed_at) || null,
        },
      });
    }

    const asset = responseAsset(uploadResult, publicId);
    const caption = extractCaption(uploadResult);
    let objects: string[] = [];
    let objectAnalysisError: string | null = null;
    try {
      const result = await cloudinary.api.update(publicId, {
        type: "upload",
        detection: "coco",
        auto_tagging: 0.3,
      });
      objects = filterCloudinaryObjectLabels(extractObjects(asObject(result)));
      console.info("RE:FRAME COCO labels:", objects);
    } catch (error) {
      objectAnalysisError = "Cloudinary could not return object labels for this image.";
      console.error("RE:FRAME COCO analysis failed:", safeServerError(error));
    }

    let qualityAnalysisError: string | null = null;
    let quality = extractQuality(uploadResult);
    try {
      const result = await cloudinary.api.update(publicId, {
        type: "upload",
        detection: "iqa",
      });
      const iqaQuality = extractQuality(asObject(result));
      if (iqaQuality.score !== null || iqaQuality.quality !== "unknown") {
        quality = iqaQuality;
      }
    } catch (error) {
      qualityAnalysisError = "Cloudinary could not return an image quality score.";
      console.error("RE:FRAME IQA analysis failed:", safeServerError(error));
    }

    const analyzedAt = new Date().toISOString();
    let persistenceError: string | null = null;
    try {
      const addContext = cloudinary.uploader.add_context as unknown as (
        context: Record<string, string>,
        publicIds: string[],
      ) => Promise<unknown>;
      await addContext(
        {
          reframe_type: "visual_record",
          reframe_caption: caption.slice(0, 450),
          reframe_objects: JSON.stringify(objects),
          reframe_quality: quality.quality,
          reframe_quality_score: quality.score?.toString() ?? "",
          reframe_analyzed_at: analyzedAt,
          reframe_category: "Unsorted",
        },
        [publicId],
      );
    } catch (error) {
      persistenceError = "The image uploaded, but its analysis details could not be saved.";
      console.error("RE:FRAME record metadata save failed:", safeServerError(error));
    }

    return NextResponse.json({
      success: true,
      asset,
      intelligence: {
        caption,
        objects,
        object_count: objects.length,
        object_analysis_error: objectAnalysisError,
        quality_analysis_error: qualityAnalysisError,
        quality: quality.quality,
        quality_score: quality.score,
        persistence_error: persistenceError,
        analyzed_at: analyzedAt,
      },
    });
  } catch (error) {
    console.error("RE:FRAME upload error:", safeServerError(error));
    return NextResponse.json(
      {
        success: false,
        error: "The image could not be uploaded. Check the file and try again.",
      },
      { status: 500 },
    );
  }
}
