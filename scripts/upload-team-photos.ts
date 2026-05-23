/**
 * Upload team photos from /tmp/team to R2 cinematic/team/.
 * Run: npx tsx --env-file=.env scripts/upload-team-photos.ts
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { r2Client } from "../src/lib/r2-client";

const BUCKET = process.env.R2_BUCKET_NAME || "metrum";
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

const FILES = [
  "shyba.jpg",
  "laschuk.jpg",
  "shakhov.jpg",
  "pekhnyk-andriy.jpg",
  "ivanchykhina.jpg",
  "pekhnyk-khrystyna.jpg",
];

async function main() {
  for (const name of FILES) {
    const abs = path.join("/tmp/team", name);
    const body = readFileSync(abs);
    const key = `cinematic/team/${name}`;
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    console.log(`  ✓ ${PUBLIC_URL}/${key}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
