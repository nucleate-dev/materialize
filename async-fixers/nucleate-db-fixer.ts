import type { Database } from "./types/supabase";

type Tables = Database["public"]["Tables"];
export type TableName = keyof Tables;

export type TableRow<TName extends TableName> = Tables[TName]["Row"];

export interface NucleateDBFixer<TName extends TableName> {
  table: TName;
  orderByColumn?: keyof TableRow<TName>;
  genIsInconsistent: (row: TableRow<TName>) => Promise<boolean> | boolean;
  genFixRow: (
    row: TableRow<TName>,
  ) => Promise<TableRow<TName>> | TableRow<TName>;
}
