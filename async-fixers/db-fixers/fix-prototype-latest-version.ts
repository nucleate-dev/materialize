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

const S3_BUCKET =
  process.env.S3_PROTOTYPE_BUCKET?.trim() || "materialize-sites";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const MAX_DELETE_BATCH = 1000;

const s3Client = new S3Client({
  region: AWS_REGION,
});

function generateVersionKey(): string {
  return `v${Date.now().toString()}`;
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
    const objects = listResponse.Contents ?? [];

    for (const object of objects) {
      if (!object.Key) {
        continue;
      }
      const suffix = object.Key.slice(sourcePrefix.length);
      const destinationKey =
        suffix.length > 0
          ? `${destinationPrefix}${suffix}`
          : destinationPrefix.slice(0, -1);

      await s3Client.send(
        new CopyObjectCommand({
          Bucket: S3_BUCKET,
          CopySource: `${S3_BUCKET}/${encodeURIComponent(object.Key)}`,
          Key: destinationKey,
        }),
      );
      keysToDelete.push(object.Key);
      copiedObjects += 1;
    }
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

export const backfill: NucleateDBFixer<"prototypes"> = {
  table: "prototypes",
  orderByColumn: "created_at",

  genIsInconsistent(row) {
    return !row.latest_build_key;
  },

  async genFixRow(row) {
    const version = generateVersionKey();
    await renameLatestPrefixToVersion(row.id, version);

    return {
      ...row,
      latest_build_key: version,
    };
  },
};

export default backfill;
