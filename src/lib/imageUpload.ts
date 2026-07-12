/**
 * Shared image-upload helpers: HEIC/HEIF detection + conversion.
 *
 * iPhones save photos as .HEIC/.HEIF by default, which browsers cannot
 * decode or preview natively. heic2any converts them client-side to a
 * normal JPEG before we read/upload them, so every image-upload entry
 * point in the app (Image Solver, Summarizer, PDF Chat) can accept them
 * transparently.
 */

function isHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    type === "image/heic" ||
    type === "image/heif" ||
    type === "image/heic-sequence" ||
    type === "image/heif-sequence"
  );
}

/**
 * Returns the file unchanged if it isn't HEIC/HEIF; otherwise converts it
 * to a JPEG File client-side. Safe to call on any File.
 */
export async function ensureBrowserSupportedImage(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  try {
    const heic2any = (await import("heic2any")).default;
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(result) ? result[0] : result;
    const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([blob], newName || "converted.jpg", { type: "image/jpeg" });
  } catch (err) {
    throw new Error("Could not convert this HEIC image — please try a JPEG or PNG instead.");
  }
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || isHeic(file);
}
