/**
 * Upload cinematic hero videos to Cloudflare R2.
 *
 * Run:
 *   npx tsx scripts/upload-cinematic-video.ts
 *
 * Reads public/videos/*.mp4 and uploads them with long-term immutable cache.
 * Prints final URLs that should be plugged into ScrollVideoHero.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { r2Client } from "../src/lib/r2-client";

const BUCKET = process.env.R2_BUCKET_NAME || "metrum";
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

if (!PUBLIC_URL) {
  console.error("R2_PUBLIC_URL not set");
  process.exit(1);
}

const VERSION = process.env.CINEMATIC_VERSION || "v2";

const FILES = [
  { local: "public/videos/building-flythrough-desktop.mp4", key: `cinematic/${VERSION}/building-flythrough-desktop.mp4` },
  { local: "public/videos/building-flythrough-mobile.mp4", key: `cinematic/${VERSION}/building-flythrough-mobile.mp4` },
];

async function upload(local: string, key: string) {
  const abs = path.resolve(process.cwd(), local);
  const size = statSync(abs).size;
  const body = readFileSync(abs);

  console.log(`→ ${local} (${(size / 1024 / 1024).toFixed(2)} MB) → r2://${BUCKET}/${key}`);

  await r2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: "video/mp4",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return `${PUBLIC_URL}/${key}`;
}

async function main() {
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Public base: ${PUBLIC_URL}`);
  console.log("");

  const results: Array<{ key: string; url: string }> = [];
  for (const f of FILES) {
    const url = await upload(f.local, f.key);
    results.push({ key: f.key, url });
    console.log(`  ✓ ${url}`);
  }

  console.log("\n────────────────────────────────────────────────");
  console.log("Paste these into ScrollVideoHero default props:");
  console.log("────────────────────────────────────────────────");
  for (const r of results) {
    console.log(`  ${r.url}`);
  }
}

main().catch((err) => {
  console.error("Upload failed:", err);
  process.exit(1);
});
