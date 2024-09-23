import * as vscode from "vscode";
import { GnoExtensionContext } from "./context";
import * as commands from "./commands";
import { getGnoConfig } from "./config";
import { GnoRunTestCodeLensProvider } from "./gnoRunTestCodeLens";
import { globalChannel } from "./global";
import { ReferenceTreeProvider } from "./utils/referenceTreeProvider";

const gnoCtx: GnoExtensionContext = {}; // Initialize Gno extension context
let diagnosticCollection: vscode.DiagnosticCollection;
let referenceTreeProvider: ReferenceTreeProvider;

export async function activate(ctx: vscode.ExtensionContext) {
  // Initialize the ReferenceTreeProvider and register it to the explorer view
  referenceTreeProvider = new ReferenceTreeProvider();
  vscode.window.registerTreeDataProvider('gnoReferencesView', referenceTreeProvider);

  gnoCtx.referenceTreeProvider = referenceTreeProvider;

  const cfg = getGnoConfig();
  const configuration = vscode.workspace.getConfiguration('editor').get('formatOnSave', false);

  // Create and push diagnostic collection for Gno
  diagnosticCollection = vscode.languages.createDiagnosticCollection('gno');
  ctx.subscriptions.push(diagnosticCollection);

  // If the language server is not used, handle on-save events
  if (!cfg['useLanguageServer']) {
      vscode.workspace.onDidSaveTextDocument(async (e) => {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor?.document.languageId === "gno") {
              diagnosticCollection.set(activeEditor.document.uri, undefined);
              // Auto-apply gofumpt formatting on save if enabled
              if (configuration) {
                  const err = await applyGofumptOnSave(ctx);
                  if (err) {
                      globalChannel.appendLine(`gno: error applying gofumpt on save: ${err}`);
                  }
              }
          }
      });
  }

  // Register all Gno commands and code lens providers
  registerCommands(ctx, gnoCtx);

  GnoRunTestCodeLensProvider.activate(ctx, gnoCtx);

  // Start the language server
  await commands.startLanguageServer(ctx, gnoCtx)();

  // Create a status bar item for updating gnopls binary
  createGnoplsStatusBarItem(ctx);
}

export function deactivate() {}

async function applyGofumptOnSave(
  ctx: vscode.ExtensionContext,
): Promise<Error | null> {
  try {
    const result = await commands.format(ctx, gnoCtx)(true);

    if (result === undefined || result === null) {
      return null;
    }

    if (result instanceof Error) {
      return result;
    }

    return new Error("Unexpected error during formatting");
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    return new Error("Unknown error occurred");
  }
}

function registerCommands(
  ctx: vscode.ExtensionContext,
  gnoCtx: GnoExtensionContext,
) {
  const registerCommand = commands.createRegisterCommand(ctx, gnoCtx);

  // List of commands to register
  const commandList = [
    {
      name: "gno.languageserver.restart",
      action: commands.startLanguageServer,
    },
    { name: "gno.findReferences", action: commands.findReferences },
    { name: "gno.format", action: commands.format },
    { name: "gno.transpile", action: commands.transpile },
    { name: "gno.clean", action: commands.clean },
    { name: "gno.test.package", action: commands.testPackage },
    { name: "gno.test.file", action: commands.testFile },
    { name: "gno.test.function", action: commands.testFunction },
    { name: "gno.mod.init", action: commands.modInit },
    { name: "gno.maketx.addpkg", action: commands.addPkg },
    { name: "gno.updateGnoplsBinary", action: commands.updateGnoplsBinary },
    { name: "gno.runTidy", action: commands.runTidy }
  ];

  // Register each command
  commandList.forEach((command) => {
    registerCommand(command.name, command.action);
  });
}

function createGnoplsStatusBarItem(ctx: vscode.ExtensionContext) {
  // Create a status bar item for updating gnopls binary
  const updateGnoplsStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );

  updateGnoplsStatusBarItem.command = "gno.updateGnoplsBinary";
  updateGnoplsStatusBarItem.text = "$(sync) Update vscode-gno";
  updateGnoplsStatusBarItem.tooltip = "Click to update vscode-gno";
  updateGnoplsStatusBarItem.show();

  // Ensure it is disposed of when the extension deactivates
  ctx.subscriptions.push(updateGnoplsStatusBarItem);
}
