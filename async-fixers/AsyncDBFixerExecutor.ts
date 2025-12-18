import * as path from "path";
import * as dotenv from "dotenv";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types/supabase";
import type { NucleateDBFixer, TableName, TableRow } from "./nucleate-db-fixer";

dotenv.config({ path: path.join(__dirname, ".env") });

const ROW_FETCH_BATCH_SIZE = 250;
const CONSISTENCY_CONCURRENCY = 10;
const FIX_CONCURRENCY = 10;
const UPSERT_BATCH_SIZE = 100;

type SupabaseTableRow<TName extends TableName> = TableRow<TName>;

export interface FixerOptions {
  dryRun?: boolean;
  whereColumn?: string;
  whereValue?: string | number;
}

export interface FixerStats {
  totalRowsProcessed: number;
  inconsistentRowsFound: number;
  rowsFixed: number;
}

export class AsyncFixerExecutor<TName extends TableName> {
  private readonly supabase: SupabaseClient<Database>;
  private stats: FixerStats = {
    totalRowsProcessed: 0,
    inconsistentRowsFound: 0,
    rowsFixed: 0,
  };

  constructor(
    private readonly backfill: NucleateDBFixer<TName>,
    private readonly options: FixerOptions = {},
  ) {
    this.validateEnv();
    this.supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  async run(): Promise<FixerStats> {
    const isDryRun = this.options.dryRun !== false; // default to true
    const isFilteredRun = this.hasFilter();

    console.log(`\n🚀 Starting backfill on table: ${this.backfill.table}`);
    console.log(
      `   Mode: ${isDryRun ? "DRY RUN (no changes will be made)" : "LIVE (will fix rows)"}`,
    );
    if (isFilteredRun) {
      console.log(
        `   Target: All rows where ${this.options.whereColumn} = ${this.options.whereValue}`,
      );
    } else {
      console.log(`   Target: All rows in table`);
    }
    console.log("");

    if (isFilteredRun) {
      await this.runFilteredRows(isDryRun);
    } else {
      await this.runFullTable(isDryRun);
    }

    this.printSummary(isDryRun);
    return this.stats;
  }

  private async runFilteredRows(isDryRun: boolean): Promise<void> {
    const rows = await this.fetchFilteredRows();
    if (rows.length === 0) {
      console.log(
        `❌ No rows found where ${this.options.whereColumn} = ${this.options.whereValue}`,
      );
      return;
    }

    console.log(`✅ Found ${rows.length} row(s) matching the filter`);
    console.log("");

    this.stats.totalRowsProcessed = rows.length;

    // Check which rows are inconsistent
    const inconsistentRows = await this.filterInconsistentRows(rows);
    this.stats.inconsistentRowsFound = inconsistentRows.length;

    console.log(
      `   👉 Found ${inconsistentRows.length} inconsistent row(s) out of ${rows.length} total`,
    );

    if (inconsistentRows.length > 0) {
      if (isDryRun) {
        // Show details for each inconsistent row in dry-run mode
        console.log(`\n   📋 Details of inconsistent rows:\n`);
        inconsistentRows.forEach((row, index) => {
          console.log(`   ❌ Row ${index + 1}:`);
          console.log(JSON.stringify(row, null, 2));
          console.log("");
        });
        console.log(
          `   ⏭️  Skipping fix for ${inconsistentRows.length} row(s) (dry run mode)`,
        );
      } else {
        // Live mode: just show stats, no detailed output
        console.log(`\n   🔧 Fixing ${inconsistentRows.length} row(s)...`);
        const fixedRows = await this.fixRows(inconsistentRows);
        await this.upsertRows(fixedRows);
        this.stats.rowsFixed = fixedRows.length;

        console.log(`   ✅ Fixed ${fixedRows.length} row(s)`);
      }
    } else {
      console.log(
        `\n   ✅ All ${rows.length} row(s) are consistent - no fixes needed`,
      );
    }
  }

  private async runFullTable(isDryRun: boolean): Promise<void> {
    let offset = 0;
    let batchNumber = 0;

    for (;;) {
      const rows = await this.fetchBatch(offset);
      if (!rows.length) {
        break;
      }

      batchNumber += 1;
      console.log(
        `📦 Processing batch #${batchNumber} (${rows.length} rows) starting at offset ${offset}`,
      );

      this.stats.totalRowsProcessed += rows.length;

      const inconsistentRows = await this.filterInconsistentRows(rows);
      this.stats.inconsistentRowsFound += inconsistentRows.length;

      console.log(
        `   👉 Found ${inconsistentRows.length} inconsistent rows in batch #${batchNumber}`,
      );

      if (inconsistentRows.length > 0 && !isDryRun) {
        const fixedRows = await this.fixRows(inconsistentRows);
        await this.upsertRows(fixedRows);
        this.stats.rowsFixed += fixedRows.length;
      } else if (inconsistentRows.length > 0 && isDryRun) {
        console.log(
          `   ⏭️  Skipping fix for ${inconsistentRows.length} rows (dry run mode)`,
        );
      }

      if (rows.length < ROW_FETCH_BATCH_SIZE) {
        break;
      }

      offset += ROW_FETCH_BATCH_SIZE;
    }
  }

  private printSummary(isDryRun: boolean): void {
    console.log("\n" + "=".repeat(70));
    console.log("📊 BACKFILL SUMMARY");
    console.log("=".repeat(70));
    console.log(`Table:                    ${this.backfill.table}`);
    console.log(`Mode:                     ${isDryRun ? "DRY RUN" : "LIVE"}`);
    console.log(`Total rows processed:     ${this.stats.totalRowsProcessed}`);
    console.log(
      `Inconsistent rows found:  ${this.stats.inconsistentRowsFound}`,
    );
    console.log(`Rows fixed:               ${this.stats.rowsFixed}`);

    const percentage =
      this.stats.totalRowsProcessed > 0
        ? (
            (this.stats.inconsistentRowsFound / this.stats.totalRowsProcessed) *
            100
          ).toFixed(2)
        : "0.00";
    console.log(`Inconsistency rate:       ${percentage}%`);

    if (isDryRun && this.stats.inconsistentRowsFound > 0) {
      console.log(
        "\n⚠️  This was a DRY RUN. No changes were made to the database.",
      );
      console.log("   Run with --no-dry-run to apply fixes.");
    } else if (!isDryRun && this.stats.rowsFixed > 0) {
      console.log("\n✅ Changes have been applied to the database.");
    }
    console.log("=".repeat(70) + "\n");
  }

  private async fetchBatch(offset: number): Promise<SupabaseTableRow<TName>[]> {
    const orderColumn = this.getOrderColumn();
    const { data, error } = await this.supabase
      .from(this.backfill.table)
      .select("*")
      .order(orderColumn, { ascending: true })
      .range(offset, offset + ROW_FETCH_BATCH_SIZE - 1);

    if (error) {
      throw new Error(
        `Failed to fetch rows for table "${this.backfill.table}" at offset ${offset}: ${error.message}`,
      );
    }

    return (data ?? []) as unknown as SupabaseTableRow<TName>[];
  }

  private async fetchFilteredRows(): Promise<SupabaseTableRow<TName>[]> {
    if (!this.hasFilter()) {
      return [];
    }

    const { data, error } = await this.supabase
      .from(this.backfill.table)
      .select("*")
      .eq(this.options.whereColumn as any, this.options.whereValue as any);

    if (error) {
      throw new Error(
        `Failed to fetch rows from table "${this.backfill.table}" where ${this.options.whereColumn} = ${this.options.whereValue}: ${error.message}`,
      );
    }

    return (data ?? []) as unknown as SupabaseTableRow<TName>[];
  }

  private async filterInconsistentRows(
    rows: SupabaseTableRow<TName>[],
  ): Promise<SupabaseTableRow<TName>[]> {
    const checks = await this.runWithConcurrency(
      rows,
      (row) => this.backfill.genIsInconsistent(row),
      CONSISTENCY_CONCURRENCY,
    );
    return rows.filter((_, index) => checks[index]);
  }

  private async fixRows(
    rows: SupabaseTableRow<TName>[],
  ): Promise<SupabaseTableRow<TName>[]> {
    return this.runWithConcurrency(
      rows,
      (row) => this.backfill.genFixRow(row),
      FIX_CONCURRENCY,
    );
  }

  private async upsertRows(rows: SupabaseTableRow<TName>[]): Promise<void> {
    for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await this.supabase
        .from(this.backfill.table)
        .upsert(chunk as any);

      if (error) {
        throw new Error(
          `Failed to upsert rows for table "${this.backfill.table}": ${error.message}`,
        );
      }

      console.log(
        `   💾 Upserted ${chunk.length} rows back into "${this.backfill.table}"`,
      );
    }
  }

  private async runWithConcurrency<T, R>(
    items: readonly T[],
    worker: (item: T, index: number) => Promise<R> | R,
    limit: number,
  ): Promise<R[]> {
    if (items.length === 0) {
      return [];
    }

    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (true) {
          const currentIndex = nextIndex++;
          if (currentIndex >= items.length) {
            break;
          }
          results[currentIndex] = await worker(
            items[currentIndex],
            currentIndex,
          );
        }
      },
    );

    await Promise.all(workers);
    return results;
  }

  private validateEnv(): void {
    const requiredVars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    const missing = requiredVars.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}`,
      );
    }
  }

  private hasFilter(): boolean {
    return (
      typeof this.options.whereColumn === "string" &&
      this.options.whereColumn.length > 0 &&
      this.options.whereValue !== undefined
    );
  }

  private getOrderColumn(): string {
    return (
      (this.backfill.orderByColumn as string | undefined) ??
      "id"
    );
  }
}

export async function runAsyncBackfill<TName extends TableName>(
  backfill: NucleateDBFixer<TName>,
  options?: FixerOptions,
): Promise<FixerStats> {
  const executor = new AsyncFixerExecutor(backfill, options);
  return await executor.run();
}
