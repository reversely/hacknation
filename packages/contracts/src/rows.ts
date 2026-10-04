import { z } from 'zod';

import { SHEET_TABS, type SheetTab } from './records';

// Sheets stores one record per row. Columns follow the schema's key order; objects and arrays
// are stored as JSON text in one cell, and null as an empty cell.
export type Cell = string | number | boolean;

export function columns(tab: SheetTab): string[] {
  return Object.keys(SHEET_TABS[tab].shape);
}

// A column holds JSON when its schema is an object, array or record, possibly nullable or
// defaulted.
function isJsonColumn(tab: SheetTab, key: string): boolean {
  let field = (SHEET_TABS[tab].shape as Record<string, z.ZodType>)[key];
  if (field instanceof z.ZodDefault) field = field.unwrap() as z.ZodType;
  if (field instanceof z.ZodNullable) field = field.unwrap() as z.ZodType;
  return field instanceof z.ZodObject || field instanceof z.ZodArray || field instanceof z.ZodRecord;
}

export function toRow<T extends SheetTab>(tab: T, record: z.infer<(typeof SHEET_TABS)[T]>): Cell[] {
  const parsed = SHEET_TABS[tab].parse(record) as Record<string, unknown>;
  return columns(tab).map((key) => {
    const value = parsed[key];
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return value as Cell;
  });
}

// Parses and validates one row; throws a ZodError naming the bad column.
export function fromRow<T extends SheetTab>(tab: T, row: Cell[]): z.infer<(typeof SHEET_TABS)[T]> {
  const schema = SHEET_TABS[tab];
  const record: Record<string, unknown> = {};
  columns(tab).forEach((key, i) => {
    const cell = row[i];
    if (cell === '' || cell === undefined) {
      record[key] = null;
    } else if (typeof cell === 'string' && isJsonColumn(tab, key)) {
      record[key] = JSON.parse(cell);
    } else {
      record[key] = cell;
    }
  });
  return schema.parse(record) as z.infer<(typeof SHEET_TABS)[T]>;
}
