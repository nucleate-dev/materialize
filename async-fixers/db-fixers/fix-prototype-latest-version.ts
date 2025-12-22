/**
 * Fixer that backfills missing prototype build versions by renaming the
 * legacy /latest/ prefix in S3 into a generated version key.
 *
 * Each inconsistent prototype (latest_build_key === null) receives a new version
 * identifier (matches the format used in the control-plane) and its S3 objects
 * are moved from `${prototypeId}/latest/` to `${prototypeId}/{version}/`.
 */

import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import type { NucleateDBFixer } from "../nucleate-db-fixer";

const S3_BUCKET = "materialize-sites";
const AWS_REGION = "us-east-2";
const MAX_DELETE_BATCH = 1000;
const COPY_CONCURRENCY = 10;

const s3Client = new S3Client({
  region: AWS_REGION,
});

function generateVersionKey(): string {
  return `v${Date.now().toString()}`;
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  let index = 0;
  const workers = Array.from({
    length: Math.min(concurrency, items.length),
  }).map(async () => {
    while (index < items.length) {
      const current = items[index++];
      await handler(current);
    }
  });
  await Promise.all(workers);
}

async function renameLatestPrefixToVersion(
  prototypeId: string,
  version: string,
): Promise<void> {
  const sourcePrefix = `${prototypeId}/latest/`;
  const destinationPrefix = `${prototypeId}/${version}/`;
  let continuationToken: string | undefined;
  const keysToDelete: string[] = [];
  let copiedObjects = 0;

  do {
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: sourcePrefix,
        ContinuationToken: continuationToken,
      }),
    );
    continuationToken = listResponse.NextContinuationToken;
    const objects = (listResponse.Contents ?? []).filter(
      (object) => !!object.Key,
    );

    await mapWithConcurrency(objects, COPY_CONCURRENCY, async (object) => {
      const sourceKey = object.Key!;
      const suffix = sourceKey.slice(sourcePrefix.length);
      const destinationKey =
        suffix.length > 0
          ? `${destinationPrefix}${suffix}`
          : destinationPrefix.slice(0, -1);

      await s3Client.send(
        new CopyObjectCommand({
          Bucket: S3_BUCKET,
          CopySource: `${S3_BUCKET}/${encodeURIComponent(sourceKey)}`,
          Key: destinationKey,
        }),
      );
      keysToDelete.push(sourceKey);
      copiedObjects += 1;
    });
  } while (continuationToken);

  if (copiedObjects === 0) {
    console.warn(
      `[prototype-latest-version-fixer] No objects found at prefix ${sourcePrefix} – skipping S3 rename for prototype ${prototypeId}`,
    );
    return;
  }

  for (let i = 0; i < keysToDelete.length; i += MAX_DELETE_BATCH) {
    const batch = keysToDelete.slice(i, i + MAX_DELETE_BATCH);
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: S3_BUCKET,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
        },
      }),
    );
  }
}

async function deleteOldVersionFolders(
  prototypeId: string,
  keepVersion: string,
): Promise<void> {
  const keepPrefix = `${prototypeId}/${keepVersion}/`;
  const keepPrefixNoSlash = keepPrefix.endsWith("/")
    ? keepPrefix.slice(0, -1)
    : keepPrefix;
  let continuationToken: string | undefined;
  const keysToDelete: string[] = [];

  do {
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: `${prototypeId}/v`,
        ContinuationToken: continuationToken,
      }),
    );
    continuationToken = listResponse.NextContinuationToken;
    const objects = listResponse.Contents ?? [];
    for (const object of objects) {
      if (
        !object.Key ||
        object.Key.startsWith(keepPrefix) ||
        object.Key === keepPrefixNoSlash
      ) {
        continue;
      }
      keysToDelete.push(object.Key);
    }
  } while (continuationToken);

  if (!keysToDelete.length) {
    return;
  }

  for (let i = 0; i < keysToDelete.length; i += MAX_DELETE_BATCH) {
    const batch = keysToDelete.slice(i, i + MAX_DELETE_BATCH);
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: S3_BUCKET,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
        },
      }),
    );
  }
}

export const backfill: NucleateDBFixer<"prototypes"> = {
  table: "prototypes",
  orderByColumn: "created_at",

  genIsInconsistent(row) {
    return !row.latest_build_key || row.latest_build_key === "latest";
  },

  async genFixRow(row) {
    const version = generateVersionKey();
    await renameLatestPrefixToVersion(row.id, version);
    await deleteOldVersionFolders(row.id, version);

    return {
      ...row,
      latest_build_key: version,
    };
  },
};

export default backfill;
