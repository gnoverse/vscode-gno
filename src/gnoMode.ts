import * as vscode from "vscode";

interface Filter extends vscode.DocumentFilter {
  language: string;
  scheme: string;
}

export const GNO_MODE: Filter = { language: "gno", scheme: "file" };
export const GNO_MOD_MODE: Filter = { language: "gno.mod", scheme: "file" };

/**
 * Checks if the given document matches either GNO_MODE or GNO_MOD_MODE.
 * This function returns true if the document is a Gno or Gno.mod file.
 *
 * @param document - The TextDocument to check.
 * @returns {boolean} - True if the document is a Gno or Gno.mod file.
 */
export function isGnoFile(document: vscode.TextDocument): boolean {
  if (
    vscode.languages.match(GNO_MODE, document) ||
    vscode.languages.match(GNO_MOD_MODE, document)
  ) {
    return true;
  }
  return false;
}
