import * as vscode from "vscode";
import path from "path";
import fs from "fs";
import { extensionId } from "./const";

/**
 * ExtensionInfo is a collection of static information about the extension.
 * It gathers version, app information, and environment-specific details.
 */
export class ExtensionInfo {
  readonly version?: string;
  readonly appName: string;
  readonly isPreview: boolean;
  readonly isInCloudIDE: boolean;

  constructor() {
    // Fetch the extension's package.json to extract version and preview mode information
    const packageJSON =
      vscode.extensions.getExtension(extensionId)?.packageJSON;
    this.version = packageJSON?.version;
    this.appName = vscode.env.appName;
    this.isPreview = !!packageJSON?.preview;
    this.isInCloudIDE =
      process.env.CLOUD_SHELL === "true" ||
      process.env.CODESPACES === "true" ||
      !!process.env.GITPOD_WORKSPACE_ID; // Check if the extension is running in a cloud IDE
  }
}

// Retrieves the 'gnopls' configuration for the given URI or for the active text editor.
export function getGnoplsConfig(
  uri?: vscode.Uri,
): vscode.WorkspaceConfiguration {
  return getConfig("gnopls", uri);
}

// Retrieves the 'go' configuration for the given URI or for the active text editor.
export const goConfig = (uri?: vscode.Uri) => {
  return getConfig("go", uri);
};

// Retrieves the 'gno' configuration for the given URI or for the active text editor.
export const getGnoConfig = (uri?: vscode.Uri) => {
  return getConfig("gno", uri);
};

/**
 * Retrieves the workspace configuration for a specific section.
 * If a URI is not provided, it defaults to the active editor's URI.
 */
function getConfig(section: string, uri?: vscode.Uri | null) {
  if (!uri && vscode.window.activeTextEditor) {
    uri = vscode.window.activeTextEditor.document.uri;
  }
  return vscode.workspace.getConfiguration(section, uri || null);
}

// Retrieve the path to the 'gnopls' binary located in the extension's root directory.
export function getGnoplsBinaryPath(): string | undefined {
  const extension = vscode.extensions.getExtension(extensionId);
  if (!extension) {
    vscode.window.showErrorMessage("Extension not found");
    return undefined;
  }
  const extensionRoot = extension.extensionPath;
  let gnoplsBinaryPath = path.join(extensionRoot, "gnopls", "build", "gnopls");
  gnoplsBinaryPath = correctBinname(gnoplsBinaryPath);

  // Check if the gnopls binary exists at the computed path
  if (fs.existsSync(gnoplsBinaryPath)) {
    return gnoplsBinaryPath;
  } else {
    vscode.window.showErrorMessage(`gnopls not found at ${gnoplsBinaryPath}`);
    return undefined;
  }
}

// Corrects the binary file name based on the platform (adds '.exe' for Windows).
function correctBinname(binPath: string): string {
  return process.platform === "win32" ? binPath + ".exe" : binPath;
}

/** Static instance of ExtensionInfo that holds extension-related data */
export const extensionInfo = new ExtensionInfo();
