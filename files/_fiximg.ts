import { readFileSync, writeFileSync } from "node:fs";
import "dotenv/config";
import pg from "pg";
import { renderGBPImage, uploadToR2 } from "./gbp-image-gen.js";
import type { GBPPost } from "./gbp-types.js";

const posts = JSON.parse(readFileSync("gbp-queue.json", "utf-8")) as GBPPost[];
const post = posts[0];
console.log("re-rendering:", post.topic, post.template_variant);
const buffer = await renderGBPImage(post);
const filename = `gbp-${post.scheduled_date.slice(0,10).replace(/-/g,"")}-${post.template_variant}-0.png`;
const url = await uploadToR2(buffer, filename);
console.log("uploaded:", url);
post.image_url = url;
writeFileSync("gbp-queue.json", JSON.stringify(posts, null, 2));

const ssl = process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false };
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl });
await c.connect();
const r = await c.query(`update gbp_post_queue set image_url=$1 where id=$2`, [url, post.id]);
console.log("rows updated:", r.rowCount);
await c.end();
