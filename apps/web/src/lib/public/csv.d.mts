export function parseCsv(text: string): {
  headers: string[];
  rows: string[][];
  delimiter: string;
};
export function cleanCsv(text: string, options?: Record<string, unknown>): any;
export function exportCsv(
  headers: unknown[],
  rows: unknown[][],
  options?: { spreadsheetSafe?: boolean },
): string;
