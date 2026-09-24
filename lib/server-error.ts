export function safeServerError(error: unknown): string {
  const describe = (value: unknown, depth = 0): string => {
    if (depth > 2) return "Nested error omitted";
    if (!(value instanceof Error)) return "Unknown server error";

    const code = "code" in value && typeof value.code === "string"
      ? ` [${value.code}]`
      : "";
    const ownMessage = value.message.trim();
    const nested = value instanceof AggregateError
      ? Array.from(value.errors).slice(0, 3).map((item) => describe(item, depth + 1))
      : value.cause instanceof Error
        ? [describe(value.cause, depth + 1)]
        : [];
    return [
      `${value.name}${code}${ownMessage ? `: ${ownMessage}` : ""}`,
      ...nested,
    ].join("; ");
  };

  let message = describe(error);
  for (const credential of [
    process.env.CLOUDINARY_API_SECRET,
    process.env.CLOUDINARY_API_KEY,
  ]) {
    if (credential) message = message.split(credential).join("[redacted]");
  }
  return message.replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ").slice(0, 500);
}
