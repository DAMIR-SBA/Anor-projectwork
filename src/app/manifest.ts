import type { MetadataRoute } from "next";

/** Installable PWA: standalone window, shortcuts, and web+anor:// deep links handled by /open. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ANOR — Hamma narsa bir joyda",
    short_name: "ANOR",
    description: "O‘zbekiston onlayn bozori: millionlab mahsulot, tez yetkazib berish, nasiya.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFFFF",
    theme_color: "#C8102E",
    lang: "uz",
    categories: ["shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Katalog", short_name: "Katalog", url: "/catalog?source=pwa", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96" }] },
      { name: "Savat", short_name: "Savat", url: "/cart?source=pwa", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96" }] },
      { name: "Buyurtmalar", short_name: "Buyurtmalar", url: "/account/orders?source=pwa", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96" }] },
      { name: "Aksiyalar", short_name: "Aksiyalar", url: "/deals?source=pwa", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96" }] },
    ],
    protocol_handlers: [{ protocol: "web+anor", url: "/open?to=%s" }],
  } as MetadataRoute.Manifest;
}
