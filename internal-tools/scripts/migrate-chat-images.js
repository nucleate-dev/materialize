#!/usr/bin/env node
/* eslint-disable no-console */
"use strict";

const path = require("path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

const SOURCE_BUCKET = "prototype-assets";
const DEST_BUCKET = "chat-images";
const LIST_LIMIT = 1000;

const args = process.argv.slice(2);
const options = {
  prefix: "",
  dryRun: false,
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--prefix") {
    options.prefix = args[i + 1] || "";
    i += 1;
  } else if (arg === "--dry-run") {
    options.dryRun = true;
  } else if (arg === "--help" || arg === "-h") {
    console.log(
      [
        "Usage: node internal-tools/scripts/migrate-chat-images.js [--prefix <path>] [--dry-run]",
        "",
        "Copies objects from the prototype-assets bucket to chat-images.",
        "",
        "Options:",
        "  --prefix   Limit copy to a specific prefix (e.g. <prototype_id>/chat).",
        "  --dry-run  List objects without copying.",
      ].join("\n"),
    );
    process.exit(0);
  }
}

const projectRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(projectRoot, ".env") });

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in environment.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const isFolderEntry = (entry) => entry.id === null && entry.metadata === null;

const listAllObjects = async (bucket, prefix) => {
  const objects = [];
  const queue = [prefix || ""];

  while (queue.length > 0) {
    const currentPrefix = queue.shift();
    let offset = 0;

    for (;;) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(currentPrefix, { limit: LIST_LIMIT, offset });

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        break;
      }

      for (const entry of data) {
        const fullPath = currentPrefix
          ? `${currentPrefix}/${entry.name}`
          : entry.name;

        if (isFolderEntry(entry)) {
          queue.push(fullPath);
        } else {
          objects.push({
            path: fullPath,
            contentType: entry.metadata?.mimetype || undefined,
          });
        }
      }

      if (data.length < LIST_LIMIT) {
        break;
      }
      offset += data.length;
    }
  }

  return objects;
};

const copyObject = async (pathName, contentType) => {
  const { data, error } = await supabase.storage
    .from(SOURCE_BUCKET)
    .download(pathName);

  if (error) {
    throw error;
  }

  const arrayBuffer = await data.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from(DEST_BUCKET)
    .upload(pathName, bytes, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    if (uploadError.statusCode === 409) {
      return "skipped";
    }
    throw uploadError;
  }

  return "copied";
};

const run = async () => {
  console.log(
    `Listing objects in ${SOURCE_BUCKET}${options.prefix ? `/${options.prefix}` : ""}...`,
  );

  const objects = await listAllObjects(SOURCE_BUCKET, options.prefix);
  console.log(`Found ${objects.length} object(s).`);

  if (options.dryRun) {
    console.log("Dry run complete. No objects copied.");
    return;
  }

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const object of objects) {
    try {
      const result = await copyObject(object.path, object.contentType);
      if (result === "skipped") {
        skipped += 1;
      } else {
        copied += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(`Failed to copy ${object.path}`, error);
    }
  }

  console.log(
    `Copy complete. Copied: ${copied}, skipped: ${skipped}, failed: ${failed}.`,
  );
};

run().catch((error) => {
  console.error("Migration failed.", error);
  process.exit(1);
});
