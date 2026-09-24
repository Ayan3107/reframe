import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";
import { getEvidenceFolder, isEvidencePublicId } from "@/lib/cloudinary-config";
import { filterCloudinaryObjectLabels } from "../../../lib/cloudinary-labels.mjs";
import { safeServerError } from "@/lib/server-error";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type JsonObject = Record<string, unknown>;
const COLLECTIONS = ["Insurance", "Home", "Repairs", "Purchases", "Travel", "Personal", "Other"] as const;

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null
    ? (value as JsonObject)
    : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseObjects(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string" || !value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Support assets that predate the JSON metadata format.
  }

  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function escapeSearchToken(value: string): string {
  return value.replace(/[!(){}\[\]*^~?:\\=&<>\"]/g, "\\$&");
}

function buildExpression(query: string, folder: string): string {
  const base = `folder=${folder}`;
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (terms.length === 0) return base;

  const searchableFields = [
    "context.reframe_caption",
    "context.reframe_title",
    "context.reframe_notes",
    "context.reframe_category",
    "context.reframe_objects",
    "context.reframe_quality",
    "tags",
    "public_id",
    "format",
  ];
  const ratings = ["high", "medium", "low", "unknown"];
  const hasQualityFacet = terms.includes("quality");
  const selectedRating = hasQualityFacet
    ? terms.find((term) => ratings.includes(term))
    : undefined;
  const searchTerms = hasQualityFacet
    ? terms.filter((term) => term !== "quality" && term !== selectedRating)
    : terms;
  const allTerms = searchTerms.map((term) => {
    const escaped = escapeSearchToken(term);
    return `(${searchableFields.map((field) => `${field}:${escaped}*`).join(" OR ")})`;
  });

  if (hasQualityFacet) {
    const qualityTerms = selectedRating ? [selectedRating] : ratings;
    allTerms.push(`(${qualityTerms.map((rating) => `context.reframe_quality:${rating}*`).join(" OR ")})`);
  }

  return allTerms.length > 0 ? `${base} AND ${allTerms.join(" AND ")}` : base;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").slice(0, 160);
    const category = url.searchParams.get("category") ?? "";
    const cursor = url.searchParams.get("cursor");
    if (category && category !== "Unsorted" && !(COLLECTIONS as readonly string[]).includes(category)) {
      return NextResponse.json(
        { success: false, error: "Choose one of the available collections." },
        { status: 400 },
      );
    }
    const validCategory = (COLLECTIONS as readonly string[]).includes(category);
    const baseExpression = buildExpression(query, getEvidenceFolder());
    const expression = category === "Unsorted"
      ? `(${baseExpression} AND -context:reframe_category) OR (${baseExpression} AND context.reframe_category:unsorted*)`
      : validCategory
        ? `${baseExpression} AND context.reframe_category:${category.toLowerCase()}*`
        : baseExpression;

    let search = cloudinary.search
      .expression(expression)
      .with_field("context")
      .with_field("metadata")
      .with_field("tags")
      .sort_by("created_at", "desc")
      .max_results(50);

    if (cursor) search = search.next_cursor(cursor);
    const result = await search.execute();

    const records = (result.resources as JsonObject[]).map((resource) => {
      const context = asObject(resource.context);
      const metadata = asObject(resource.metadata);
      const assetTags = filterCloudinaryObjectLabels(resource.tags);
      const savedObjects = filterCloudinaryObjectLabels(parseObjects(context.reframe_objects));
      const rawScore = context.reframe_quality_score;
      const score = rawScore === "" || rawScore === undefined
        ? null
        : Number(rawScore);

      return {
        asset_id: stringValue(resource.asset_id),
        public_id: stringValue(resource.public_id),
        secure_url: stringValue(resource.secure_url),
        optimized_url: cloudinary.url(stringValue(resource.public_id), {
          secure: true,
          transformation: [
            { width: 1280, height: 1280, crop: "limit", quality: "auto", fetch_format: "auto" },
          ],
        }),
        format: stringValue(resource.format),
        width: Number(resource.width ?? 0),
        height: Number(resource.height ?? 0),
        bytes: Number(resource.bytes ?? 0),
        created_at: stringValue(resource.created_at),
        title: stringValue(context.reframe_title),
        notes: stringValue(context.reframe_notes),
        category: stringValue(context.reframe_category, "Unsorted") || "Unsorted",
        caption: stringValue(context.reframe_caption, "No caption available."),
        objects: savedObjects.length > 0 ? savedObjects : assetTags,
        quality: stringValue(context.reframe_quality, "unknown"),
        quality_score: score !== null && Number.isFinite(score) ? score : null,
        analyzed_at: stringValue(context.reframe_analyzed_at) || null,
        tags: assetTags,
        metadata,
      };
    });

    return NextResponse.json({
      success: true,
      total: records.length,
      records,
      next_cursor: result.next_cursor ?? null,
    });
  } catch (error) {
    console.error("RE:FRAME records search failed:", safeServerError(error));
    return NextResponse.json(
      {
        success: false,
        error: "Could not load visual records. Please try again.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body: unknown = await request.json();
    const values = asObject(body);
    const publicId = stringValue(values.public_id);
    const title = stringValue(values.title).trim();
    const notes = stringValue(values.notes).trim();
    const category = stringValue(values.category).trim();

    if (!isEvidencePublicId(publicId)) {
      return NextResponse.json(
        { success: false, error: "Choose a valid RE:FRAME record." },
        { status: 400 },
      );
    }
    if (title.length > 120 || notes.length > 900) {
      return NextResponse.json(
        { success: false, error: "Titles are limited to 120 characters and notes to 900." },
        { status: 400 },
      );
    }
    if (category && category !== "Unsorted" && !(COLLECTIONS as readonly string[]).includes(category)) {
      return NextResponse.json(
        { success: false, error: "Choose one of the available collections." },
        { status: 400 },
      );
    }

    const addContext = cloudinary.uploader.add_context as unknown as (
      context: Record<string, string>,
      publicIds: string[],
    ) => Promise<unknown>;
    await addContext(
      { reframe_title: title, reframe_notes: notes, reframe_category: category || "Unsorted" },
      [publicId],
    );

    return NextResponse.json({ success: true, title, notes, category: category || "Unsorted" });
  } catch (error) {
    console.error(
      "RE:FRAME record update failed:",
      safeServerError(error),
    );
    return NextResponse.json(
      {
        success: false,
        error: "Could not save these record details. Please try again.",
      },
      { status: 500 },
    );
  }
}
