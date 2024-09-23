import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { LanguageServerConfig, ServerInfo } from "./language/gnoLanguageServer";
import { LegacyLanguageService } from "./language/registerDefaultProviders";
import { ReferenceTreeProvider } from "./utils/referenceTreeProvider";
/**
 * Interface defining the context for the Gno extension.
 * This context holds various properties related to the state of the language client, diagnostics, and server information.
 */
export interface GnoExtensionContext {
  languageClient?: LanguageClient; // communication with the language server
  legacyLanguageService?: LegacyLanguageService; // Legacy language service when not using the language server
  latestConfig?: LanguageServerConfig; // Configuration of the language server
  serverOutputChannel?: vscode.OutputChannel; // server-side output.
  serverTraceChannel?: vscode.OutputChannel; // client-side tracing.
  govulncheckOutputChannel?: vscode.OutputChannel; // govulncheck output.
  languageServerIsRunning?: boolean;
  // serverInfo is the information from the server received during initialization.
  serverInfo?: ServerInfo;
  // lastUserAction is the time of the last user-triggered change.
  // A user-triggered change is a didOpen, didChange, didSave, or didClose event.
  lastUserAction?: Date;
  crashCount?: number; // Number of times the language server has crashed
  // Diagnostic collections for build, linting, and vetting issues in the code
  buildDiagnosticCollection?: vscode.DiagnosticCollection;
  lintDiagnosticCollection?: vscode.DiagnosticCollection;
  vetDiagnosticCollection?: vscode.DiagnosticCollection;
  referenceTreeProvider?: ReferenceTreeProvider; // Tree provider to display references in the explorer
}
