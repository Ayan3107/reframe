const DEFAULT_EVIDENCE_FOLDER = "reframe/evidence";

export function getEvidenceFolder(): string {
  const folder = (process.env.CLOUDINARY_EVIDENCE_FOLDER ?? DEFAULT_EVIDENCE_FOLDER).trim();
  const segments = folder.split("/");
  if (
    !folder ||
    folder.startsWith("/") ||
    folder.endsWith("/") ||
    !/^[a-zA-Z0-9/_-]+$/.test(folder) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("CLOUDINARY_EVIDENCE_FOLDER must be a safe Cloudinary folder path.");
  }
  return folder;
}

export function isEvidencePublicId(publicId: string): boolean {
  let folder: string;
  try {
    folder = getEvidenceFolder();
  } catch {
    return false;
  }
  const prefix = `${folder}/`;
  const assetName = publicId.startsWith(prefix) ? publicId.slice(prefix.length) : "";
  return /^[a-zA-Z0-9_-]+$/.test(assetName);
}
