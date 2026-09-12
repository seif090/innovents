export class CsvExportUtil {
  /**
   * Sanitizes a single cell to prevent Spreadsheet Formula Injection (CSV Injection).
   * If a string value begins with dangerous characters (=, +, -, @, \t, \r),
   * it prepends a single quote to neutralize formula evaluation in Excel/Sheets.
   */
  static sanitizeCell(val: unknown): string {
    if (val === null || val === undefined) {
      return '';
    }

    let str = typeof val === 'object' && val instanceof Date ? val.toISOString() : String(val);

    // Formula injection defense: neutralize leading formula characters
    if (str.length > 0 && ['=', '+', '-', '@', '\t', '\r'].includes(str.charAt(0))) {
      str = "'" + str;
    }

    // Escape double quotes by doubling them
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }

    return str;
  }

  /**
   * Converts columns and row objects to RFC-4180 compliant CSV string
   */
  static formatCsv<T extends object>(
    columns: { header: string; key: keyof T | ((row: T) => unknown) }[],
    rows: T[],
  ): string {
    const headerLine = columns.map((c) => this.sanitizeCell(c.header)).join(',');
    const dataLines = rows.map((row) => {
      return columns
        .map((col) => {
          const rawVal =
            typeof col.key === 'function'
              ? col.key(row)
              : (row as Record<string, unknown>)[col.key as string];
          return this.sanitizeCell(rawVal);
        })
        .join(',');
    });

    return [headerLine, ...dataLines].join('\r\n');
  }
}
