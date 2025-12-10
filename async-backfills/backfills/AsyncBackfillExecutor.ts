import * as path from "path"
import * as dotenv from "dotenv"
import { createClient, SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../types/supabase"
import type {
  NucleateBackfill,
  TableName,
  TableRow,
} from "../types/nucleate-backfill"

dotenv.config({ path: path.join(__dirname, "../.env") })

const ROW_FETCH_BATCH_SIZE = 250
const CONSISTENCY_CONCURRENCY = 10
const FIX_CONCURRENCY = 10
const UPSERT_BATCH_SIZE = 100

type SupabaseTableRow<TName extends TableName> = TableRow<TName>

export class AsyncBackfillExecutor<TName extends TableName> {
  private readonly supabase: SupabaseClient<Database>

  constructor(private readonly backfill: NucleateBackfill<TName>) {
    this.validateEnv()
    this.supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }

  async run(): Promise<void> {
    let offset = 0
    let batchNumber = 0

    for (;;) {
      const rows = await this.fetchBatch(offset)
      if (!rows.length) {
        break
      }

      batchNumber += 1
      console.log(
        `📦 Processing batch #${batchNumber} (${rows.length} rows) starting at offset ${offset}`,
      )

      const inconsistentRows = await this.filterInconsistentRows(rows)
      console.log(
        `   👉 Found ${inconsistentRows.length} inconsistent rows in batch #${batchNumber}`,
      )

      if (inconsistentRows.length > 0) {
        const fixedRows = await this.fixRows(inconsistentRows)
        await this.upsertRows(fixedRows)
      }

      if (rows.length < ROW_FETCH_BATCH_SIZE) {
        break
      }

      offset += ROW_FETCH_BATCH_SIZE
    }
  }

  private async fetchBatch(
    offset: number,
  ): Promise<SupabaseTableRow<TName>[]> {
    const { data, error } = await this.supabase
      .from(this.backfill.table)
      .select("*")
      .range(offset, offset + ROW_FETCH_BATCH_SIZE - 1)

    if (error) {
      throw new Error(
        `Failed to fetch rows for table "${this.backfill.table}" at offset ${offset}: ${error.message}`,
      )
    }

    return (data ?? []) as unknown as SupabaseTableRow<TName>[]
  }

  private async filterInconsistentRows(
    rows: SupabaseTableRow<TName>[],
  ): Promise<SupabaseTableRow<TName>[]> {
    const checks = await this.runWithConcurrency(
      rows,
      (row) => this.backfill.genIsInconsistent(row),
      CONSISTENCY_CONCURRENCY,
    )
    return rows.filter((_, index) => checks[index])
  }

  private async fixRows(
    rows: SupabaseTableRow<TName>[],
  ): Promise<SupabaseTableRow<TName>[]> {
    return this.runWithConcurrency(
      rows,
      (row) => this.backfill.genFixRow(row),
      FIX_CONCURRENCY,
    )
  }

  private async upsertRows(rows: SupabaseTableRow<TName>[]): Promise<void> {
    for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_BATCH_SIZE)
      const { error } = await this.supabase
        .from(this.backfill.table)
        .upsert(chunk as any)

      if (error) {
        throw new Error(
          `Failed to upsert rows for table "${this.backfill.table}": ${error.message}`,
        )
      }

      console.log(
        `   💾 Upserted ${chunk.length} rows back into "${this.backfill.table}"`,
      )
    }
  }

  private async runWithConcurrency<T, R>(
    items: readonly T[],
    worker: (item: T, index: number) => Promise<R> | R,
    limit: number,
  ): Promise<R[]> {
    if (items.length === 0) {
      return []
    }

    const results: R[] = new Array(items.length)
    let nextIndex = 0

    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (true) {
          const currentIndex = nextIndex++
          if (currentIndex >= items.length) {
            break
          }
          results[currentIndex] = await worker(items[currentIndex], currentIndex)
        }
      },
    )

    await Promise.all(workers)
    return results
  }

  private validateEnv(): void {
    const requiredVars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    const missing = requiredVars.filter((key) => !process.env[key])
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}`,
      )
    }
  }
}

export async function runAsyncBackfill<TName extends TableName>(
  backfill: NucleateBackfill<TName>,
): Promise<void> {
  const executor = new AsyncBackfillExecutor(backfill)
  await executor.run()
}
