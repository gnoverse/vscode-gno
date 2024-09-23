import * as vscode from "vscode";
import { CancellationToken, CodeLens, TextDocument } from "vscode";
import { getGnoConfig } from "./config";
import { getTestFunctions } from "./testUtil";
import { GnoBaseCodeLensProvider } from "./gnoBaseCodeLens";
import { GoLegacyDocumentSymbolProvider } from "./language/legacy/goOutline";
import { GnoExtensionContext } from "./context";
import { GNO_MODE } from "./gnoMode";

export class GnoRunTestCodeLensProvider extends GnoBaseCodeLensProvider {
  /**
   * Activate the GnoRunTestCodeLensProvider and register it for the GNO_MODE language.
   * Also listens for configuration changes and updates the provider accordingly.
   */
  static activate(ctx: vscode.ExtensionContext, gnoCtx: GnoExtensionContext) {
    const testCodeLensProvider = new this(gnoCtx);

    // Register the CodeLens provider for GNO_MODE
    ctx.subscriptions.push(
      vscode.languages.registerCodeLensProvider(GNO_MODE, testCodeLensProvider),
    );

    // Listen for changes in the Gno configuration
    ctx.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(
        async (e: vscode.ConfigurationChangeEvent) => {
          // If the 'gno' configuration is changed, update the CodeLens settings
          if (!e.affectsConfiguration("gno")) {
            return;
          }
          const updatedGnoConfig = getGnoConfig();
          if (updatedGnoConfig["enableCodeLens"]) {
            testCodeLensProvider.setEnabled(
              updatedGnoConfig["enableCodeLens"]["runtest"],
            );
          }
        },
      ),
    );
  }

  // Constructor that initializes the Gno context
  constructor(private readonly gnoCtx: GnoExtensionContext) {
    super();
  }

  /**
   * Provides the CodeLens for the given document.
   * This function checks if CodeLens is enabled for running tests and if the file is a test file.
   */
  public async provideCodeLenses(
    document: TextDocument,
    token: CancellationToken,
  ): Promise<CodeLens[]> {
    // If CodeLens is disabled, return an empty array
    if (!this.enabled) {
      return [];
    }

    // Get the configuration for the current document
    const config = getGnoConfig(document.uri);
    const codeLensConfig = config.get<{ [key: string]: any }>("enableCodeLens");
    const codelensEnabled = codeLensConfig ? codeLensConfig["runtest"] : false;

    // Only process the document if CodeLens is enabled and the file is a test file
    if (!codelensEnabled || !document.fileName.endsWith("_test.gno")) {
      return [];
    }

    // Get CodeLenses for both the package and the functions
    const codelenses = await Promise.all([
      this.getCodeLensForPackage(document, token),
      this.getCodeLensForFunctions(document, token),
    ]);

    // Return the combined CodeLenses
    return ([] as CodeLens[]).concat(...codelenses);
  }

  /**
   * Retrieves the CodeLens for the package level tests (run package tests and run file tests).
   */
  private async getCodeLensForPackage(
    document: TextDocument,
    token: CancellationToken,
  ): Promise<CodeLens[]> {
    const documentSymbolProvider = new GoLegacyDocumentSymbolProvider(false);
    const symbols = await documentSymbolProvider.provideDocumentSymbols(
      document,
      token,
    );

    // If no symbols are found, return an empty array
    if (!symbols || symbols.length === 0) {
      return [];
    }

    const pkg = symbols[0]; // The first symbol is typically the package
    if (!pkg) {
      return [];
    }

    // Create CodeLenses for running package and file tests
    const range = pkg.range;
    const packageCodeLens = [
      new CodeLens(range, {
        title: "run package tests",
        command: "gno.test.package",
      }),
      new CodeLens(range, {
        title: "run file tests",
        command: "gno.test.file",
      }),
    ];

    return packageCodeLens;
  }

  /**
   * Retrieves the CodeLens for individual test functions.
   */
  private async getCodeLensForFunctions(
    document: TextDocument,
    token: CancellationToken,
  ): Promise<CodeLens[]> {
    // Fetch test functions for the current document
    const testFunctions = await getTestFunctions(this.gnoCtx, document, token);
    if (!testFunctions) {
      return [];
    }

    // Create CodeLenses for each test function
    const codelens: CodeLens[] = [];
    for (const f of testFunctions) {
      codelens.push(
        new CodeLens(f.range, {
          title: "run test",
          command: "gno.test.function",
          arguments: [{ functionName: f.name }], // Pass the function name as an argument
        }),
      );
    }

    return codelens;
  }
}
