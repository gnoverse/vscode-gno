import * as vscode from "vscode";

/**
 * Base class for providing CodeLens in Gno files.
 * Manages the enable/disable state of CodeLens and emits events when the state changes.
 */
export abstract class GnoBaseCodeLensProvider
  implements vscode.CodeLensProvider
{
  protected enabled = true;
  private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();

  public get onDidChangeCodeLenses(): vscode.Event<void> {
    return this.onDidChangeCodeLensesEmitter.event;
  }

  public setEnabled(enabled: false): void {
    if (this.enabled !== enabled) {
      this.enabled = enabled;
      this.onDidChangeCodeLensesEmitter.fire();
    }
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    return [];
  }
}
