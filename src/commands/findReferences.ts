import * as vscode from "vscode";
import { CommandFactory } from ".";

interface Location {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export const findReferences: CommandFactory = (ctx, gnoCtx) => {
  return async () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const position = editor.selection.active;
      const uri = editor.document.uri;

      // Ensure the language client is initialized
      if (!gnoCtx.languageClient) {
        vscode.window.showErrorMessage("Language client is not initialized.");
        return;
      }

      try {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        // Ensure there is at least one workspace folder
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage("No workspace folder found.");
          return;
        }

        const gnoFiles: vscode.Uri[] = [];

        // Find all .gno files in the user's workspace
        for (const folder of workspaceFolders) {
          const foundFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(folder.uri.fsPath, "**/*.gno"),
          );

          // Filter files to ensure they belong to the current workspace
          const filteredFiles = foundFiles.filter((file) =>
            workspaceFolders.some((workspace) =>
              file.fsPath.startsWith(workspace.uri.fsPath),
            ),
          );

          gnoFiles.push(...filteredFiles);
        }

        vscode.window.showInformationMessage(
          `Found ${gnoFiles.length} .gno files in the user's workspace.`,
        );

        // Open each .gno file to send to the LSP server
        for (const file of gnoFiles) {
          const document = await vscode.workspace.openTextDocument(file);
          vscode.window.showInformationMessage(`Opening file: ${file.fsPath}`);

          gnoCtx.languageClient.sendNotification("textDocument/didOpen", {
            textDocument: {
              uri: document.uri.toString(),
              languageId: "gno",
              version: 1,
              text: document.getText(),
            },
          });
        }

        // Request references for the current file and position
        const locations: Location[] = await gnoCtx.languageClient.sendRequest(
          "textDocument/references",
          {
            textDocument: { uri: uri.toString() },
            position: { line: position.line, character: position.character },
            context: { includeDeclaration: true },
          },
        );

        // Process and display references if any are found
        if (locations && locations.length > 0) {
          const referenceItems = locations.map((location) => ({
            label: vscode.Uri.parse(location.uri).fsPath,
            uri: vscode.Uri.parse(location.uri),
            range: new vscode.Range(
              new vscode.Position(
                location.range.start.line,
                location.range.start.character,
              ),
              new vscode.Position(
                location.range.end.line,
                location.range.end.character,
              ),
            ),
          }));

          // Refresh the ReferenceTreeProvider with found references
          if (gnoCtx.referenceTreeProvider) {
            gnoCtx.referenceTreeProvider.refresh(referenceItems);
            await vscode.commands.executeCommand(
              "workbench.view.extension.gnoReferences",
            );
            vscode.window.showInformationMessage(
              `Found ${locations.length} references.`,
            );
          }
        } else {
          vscode.window.showInformationMessage("No references found.");
        }
      } catch (error) {
        // Handle errors during reference fetching
        console.error("Error fetching references:", error);
      }
    }
  };
};
