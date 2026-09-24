import { createHmac } from "node:crypto";

export function getContentAddress(bytes) {
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!secret) {
    throw new Error("Cloudinary API secret is not configured.");
  }
  return createHmac("sha256", secret).update(bytes).digest("hex");
}

export function isExistingUpload(result) {
  if (typeof result !== "object" || result === null) return false;
  const existing = result.existing;
  return existing === true ||
    (typeof existing === "string" && existing.toLowerCase() === "true");
}
