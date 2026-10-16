/**
 * <source> list for a video URL. The bundled demo clips also ship as WebM (VP8) for browsers
 * without H.264; the browser picks the first one it can play. Uploads are served as uploaded.
 */
export function videoSources(url: string): Array<{ src: string; type: string }> {
  if (url.startsWith("/demo/videos/") && url.endsWith(".mp4")) return [{ src: url.replace(/\.mp4$/, ".webm"), type: "video/webm" }, { src: url, type: "video/mp4" }];
  return [{ src: url, type: url.endsWith(".webm") ? "video/webm" : "video/mp4" }];
}
