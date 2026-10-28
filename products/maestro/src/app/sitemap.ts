import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Uma página pública só: a inicial. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl()}/`, changeFrequency: "monthly", priority: 1 }];
}
