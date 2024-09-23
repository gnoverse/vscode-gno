import * as vscode from "vscode";
import { NearestNeighborDict, Node } from "./avlTree";
import path = require("path");
import fs = require("fs");
import os = require("os");
import { goConfig } from "./config";
import {
  fixDriveCasingInWindows,
  getInferredGopath,
  resolveHomeDir,
} from "./utils/pathUtils";

let cachedToolsGopath: string | undefined;

export const envPath =
  process.env["PATH"] ||
  (process.platform === "win32" ? process.env["Path"] : null);

// Returns the path to the binary tool.
export function getBinPath(tool: string): string {
  const binPath = resolvePath(tool); // Use the resolved path to find the path to the tool
  return binPath;
}

// Prompts the user if the required tool is missing, with an option to install.
export async function promptForMissingTool(toolName: string) {
  const choise = await vscode.window.showInformationMessage(
    `${toolName} is not found. Please ensure it is installed and available in the PATH: ${envPath}`,
    "Install",
    "Ignore",
  );

  if (choise === "Install") {
    // Open the external link for installation instructions
    // TODO: replace URL with the wiki URL
    vscode.env.openExternal(vscode.Uri.parse("https://docs.gno.land"));
  }
}

// Returns the value of the 'toolsManagement.checkForUpdates' configuration from the Gno workspace settings.
export function getCheckForToolsUpdatesConfig(
  gnocfg: vscode.WorkspaceConfiguration,
) {
  return gnocfg.get("toolsManagement.checkForUpdates") as string;
}

/**
 * Generates a string that includes the file name, file size in bytes, and file content.
 * This is useful for archiving or transporting file contents.
 */
export function getFileArchive(document: vscode.TextDocument): string {
  const fileContents = document.getText();
  return (
    document.fileName +
    "\n" +
    Buffer.byteLength(fileContents, "utf8") +
    "\n" +
    fileContents
  );
}

/**
 * Creates a memoized byte offset converter for UTF-8 buffers.
 * This converter caches previously calculated byte-to-character conversions to improve performance.
 */
export function makeMemoizedByteOffsetConverter(
  buffer: Buffer,
): (byteOffset: number) => number {
  const defaultValue = new Node<number, number>(0, 0); // 0 bytes will always be 0 characters
  const memo = new NearestNeighborDict(
    defaultValue,
    NearestNeighborDict.NUMERIC_DISTANCE_FUNCTION,
  );
  return (byteOffset: number) => {
    const nearest = memo.getNearest(byteOffset);
    const byteDelta = byteOffset - nearest.key;

    if (byteDelta === 0) {
      return nearest.value ?? 0;
    }

    let charDelta: number;
    if (byteDelta > 0) {
      charDelta = buffer.toString("utf8", nearest.key, byteOffset).length;
    } else {
      charDelta = -buffer.toString("utf8", byteOffset, nearest.key).length;
    }

    memo.insert(byteOffset, (nearest.value ?? 0) + charDelta);
    return (nearest.value ?? 0) + charDelta;
  };
}

/**
 * Retrieves the current GOPATH based on workspace or file location.
 * The function attempts to infer the GOPATH from the workspace or file structure if the setting is enabled.
 */
export function getCurrentGoPath(workspaceUri?: vscode.Uri): string {
  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
  const currentFilePath = fixDriveCasingInWindows(
    activeEditorUri?.fsPath ?? "",
  );
  const currentRoot =
    (workspaceUri && workspaceUri.fsPath) ||
    getWorkspaceFolderPath(activeEditorUri) ||
    "";
  const config = goConfig(workspaceUri || activeEditorUri);

  let inferredGopath: string | undefined = inferGopath(
    currentRoot,
    currentFilePath,
  ); // Infer GOPATH if possible

  if (
    inferredGopath &&
    process.env["GOPATH"] &&
    inferredGopath !== process.env["GOPATH"]
  ) {
    inferredGopath += path.delimiter + process.env["GOPATH"];
  }

  const configGopath = config["gopath"]
    ? resolvePath(substituteEnv(config["gopath"]), currentRoot)
    : "";
  return inferredGopath || configGopath || process.env["GOPATH"] || "";
}

/**
 * Retrieves the tools GOPATH, either from cache or by resolving it.
 * Caches the result to avoid redundant lookups.
 */
export function getToolsGopath(useCache = true): string {
  if (useCache && cachedToolsGopath) {
    return cachedToolsGopath;
  }
  cachedToolsGopath = resolveToolsGopath();
  return cachedToolsGopath;
}

/**
 * Resolves the tools GOPATH based on the workspace or environment configuration.
 * Handles multi-root workspaces and trusted workspace scenarios.
 */
function resolveToolsGopath(): string {
  let toolsGopathForWorkspace = substituteEnv(goConfig()["toolsGopath"] || "");

  // Handle single-root workspace case
  if (
    !vscode.workspace.workspaceFolders ||
    vscode.workspace.workspaceFolders.length <= 1
  ) {
    return resolvePath(toolsGopathForWorkspace);
  }

  // Handle multi-root workspace, resolve home (~) and workspace variables
  if (toolsGopathForWorkspace.startsWith("~")) {
    toolsGopathForWorkspace = path.join(
      os.homedir(),
      toolsGopathForWorkspace.substr(1),
    );
  }
  if (
    toolsGopathForWorkspace &&
    toolsGopathForWorkspace.trim() &&
    !/\${workspaceFolder}|\${workspaceRoot}/.test(toolsGopathForWorkspace)
  ) {
    return toolsGopathForWorkspace;
  }

  // If the workspace is not trusted, return the resolved toolsGopath
  if (!vscode.workspace.isTrusted) {
    return toolsGopathForWorkspace;
  }

  // In multi-root, check if any folder has toolsGopath set in its configuration
  for (const folder of vscode.workspace.workspaceFolders) {
    let toolsGopathFromConfig = <string>(
      goConfig(folder.uri).inspect("toolsGopath")?.workspaceFolderValue
    );
    toolsGopathFromConfig = resolvePath(
      toolsGopathFromConfig,
      folder.uri.fsPath,
    );
    if (toolsGopathFromConfig) {
      return toolsGopathFromConfig;
    }
  }
  return toolsGopathForWorkspace;
}

/**
 * Expands ~ to homedir in non-Windows platforms and resolves workspace variables.
 * Replaces ${workspaceFolder}, ${workspaceRoot}, and ${workspaceFolderBasename}.
 */
export function resolvePath(
  inputPath: string,
  workspaceFolder?: string,
): string {
  if (!inputPath || !inputPath.trim()) {
    return inputPath;
  }

  // Replace workspace-specific variables
  if (workspaceFolder) {
    inputPath = inputPath
      .replace(/\${workspaceFolder}|\${workspaceRoot}/g, workspaceFolder)
      .replace(/\${workspaceFolderBasename}/g, path.basename(workspaceFolder));
  }

  // Resolve ~ to home directory
  return resolveHomeDir(inputPath);
}

/**
 * Gets the workspace folder path for a given file URI, or returns the first workspace folder if none is specified.
 */
export function getWorkspaceFolderPath(
  fileUri?: vscode.Uri,
): string | undefined {
  if (fileUri) {
    const workspace = vscode.workspace.getWorkspaceFolder(fileUri);
    if (workspace) {
      return fixDriveCasingInWindows(workspace.uri.fsPath);
    }
  }

  // fall back to the first workspace folder if available
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length) {
    return fixDriveCasingInWindows(folders[0].uri.fsPath);
  }
  return undefined;
}

/**
 * Substitutes environment variables in a given string (${env:VAR_NAME}).
 */
export function substituteEnv(input: string): string {
  return input.replace(/\${env:([^}]+)}/g, (match, capture) => {
    return process.env[capture.trim()] || "";
  });
}

/**
 * Removes duplicate diagnostics, comparing the lines of existing and new diagnostics.
 */
export function removeDuplicateDiagnostics(
  collection: vscode.DiagnosticCollection | undefined,
  fileUri: vscode.Uri,
  newDiagnostics: vscode.Diagnostic[],
) {
  if (collection && collection.has(fileUri)) {
    const existingDiagnostics = collection.get(fileUri)?.slice() ?? [];
    const uniqueDiagnostics = deDupeDiagnostics(
      newDiagnostics,
      existingDiagnostics,
    );
    collection.set(fileUri, uniqueDiagnostics);
  }
}

/**
 * Filters out duplicate diagnostics based on line numbers.
 * Keeps only diagnostics that are not already present in the provided build diagnostics.
 */
function deDupeDiagnostics(
  buildDiagnostics: vscode.Diagnostic[],
  otherDiagnostics: vscode.Diagnostic[],
): vscode.Diagnostic[] {
  const buildDiagnosticsLines = buildDiagnostics.map(
    (diagnostic) => diagnostic.range.start.line,
  );
  return otherDiagnostics.filter(
    (diagnostic) =>
      !buildDiagnosticsLines.includes(diagnostic.range.start.line),
  );
}

// Attempts to infer the GOPATH based on the workspace or file location.
function inferGopath(
  currentRoot: string,
  currentFilePath: string,
): string | undefined {
  let inferredGopath =
    getInferredGopath(currentRoot) || getInferredGopath(currentFilePath);
  if (!inferredGopath) {
    try {
      if (fs.statSync(path.join(currentRoot, "src")).isDirectory()) {
        inferredGopath = currentRoot;
      }
    } catch (e) {
      // No op if the directory does not exist
    }
  }
  return inferredGopath;
}
