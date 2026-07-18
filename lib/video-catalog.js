export const STREAM_IFRAME_RE = /^https:\/\/(?:customer-[a-z0-9-]+\.cloudflarestream\.com|iframe\.videodelivery\.net)\/[A-Za-z0-9_-]+\/iframe(?:\?.*)?$/;

// Geef uitsluitend de minimale patiëntdata terug. Concepten, afgekeurde versies en
// review-identiteiten blijven in de productiecatalogus op de server.
export function publicCatalogVideo(catalog, exerciseId) {
  const video = (catalog.videos || []).find((v) => v.exerciseId === exerciseId && v.status === "approved");
  if (!video || video.provider !== "cloudflare-stream" || !STREAM_IFRAME_RE.test(String(video.iframe || ""))
      || !video.clinicalReview || !video.clinicalReview.reviewer || !video.clinicalReview.approvedAt) return null;
  return {
    provider: "cloudflare-stream",
    iframe: video.iframe,
    languages: Array.isArray(video.languages) ? video.languages.slice(0, 20) : ["nl"],
    version: Number(video.version) || 1,
    aiGenerated: video.aiGenerated !== false,
    clinicallyReviewed: true
  };
}
