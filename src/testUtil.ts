/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from "vscode";
import { GoLegacyDocumentSymbolProvider } from "./language/legacy/goOutline";
import { GnoExtensionContext } from "./context";

// https://github.com/golang/go/blob/117b1c84d3678a586c168a5f7f2f0a750c27f0c2/src/cmd/go/internal/load/test.go#L487
// uses !unicode.isLower to find test/example/benchmark functions.
// There could be slight difference between \P{Ll} (not lowercase letter)
// & go unicode package's uppercase detection. But hopefully
// these will be replaced by gopls's codelens computation soon.
const testFuncRegex = /^Test$|^Test\P{Ll}.*|^Example$|^Example\P{Ll}.*/u;
const testMethodRegex = /^\(([^)]+)\)\.(Test|Test\P{Ll}.*)$/u;
const benchmarkRegex = /^Benchmark$|^Benchmark\P{Ll}.*/u;
const fuzzFuncRegx = /^Fuzz$|^Fuzz\P{Ll}.*/u;
const testMainRegex = /TestMain\(.*\*testing.M\)/;

/**
 * Returns all Go unit test functions in the given source file.
 *
 * @param the URI of a Go source file.
 * @return test function symbols for the source file.
 */
export async function getTestFunctions(
  gnoCtx: GnoExtensionContext,
  doc: vscode.TextDocument,
  token?: vscode.CancellationToken,
): Promise<vscode.DocumentSymbol[] | undefined> {
  const documentSymbolProvider = new GoLegacyDocumentSymbolProvider(true);
  const symbols = await documentSymbolProvider.provideDocumentSymbols(
    doc,
    token,
  );
  if (!symbols || symbols.length === 0) {
    return;
  }
  const symbol = symbols[0];
  if (!symbol) {
    return;
  }
  const children = symbol.children;

  // With gopls dymbol provider symbols, the symbols have the imports of all
  // the package, so suite tests from all files will be found.
  const testify = importsTestify(symbols);
  return children.filter(
    (sym) =>
      (sym.kind === vscode.SymbolKind.Function ||
        sym.kind === vscode.SymbolKind.Method) &&
      // Skip TestMain(*testing.M) - see https://github.com/golang/vscode-go/issues/482
      !testMainRegex.test(doc.lineAt(sym.range.start.line).text) &&
      (testFuncRegex.test(sym.name) ||
        fuzzFuncRegx.test(sym.name) ||
        (testify && testMethodRegex.test(sym.name))),
  );
}

export function importsTestify(syms: vscode.DocumentSymbol[]): boolean {
  if (!syms || syms.length === 0 || !syms[0]) {
    return false;
  }
  const children = syms[0].children;
  return children.some(
    (sym) =>
      sym.kind === vscode.SymbolKind.Namespace &&
      (sym.name === '"github.com/stretchr/testify/suite"' ||
        sym.name === "github.com/stretchr/testify/suite" ||
        sym.name === "testing"),
  );
}
