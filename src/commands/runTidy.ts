import * as vscode from "vscode";
import cp from "child_process";
import { CommandFactory } from ".";
import { getBinPath, promptForMissingTool } from "../util";
import { globalChannel } from "../global";
import dayjs from "dayjs";

export const runTidy: CommandFactory = (ctx, gnoCtx) => {
  return async () => {
    globalChannel.clear();

    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders === undefined || wsFolders?.length === 0) {
      vscode.window.showErrorMessage(
        "gno.mod.tidy: cannot get workspace folder",
      );
      return new Error("gno.mod.tidy: cannot get workspace folder");
    }

    const rootDir = wsFolders?.[0].uri.fsPath;

    // Ensure that gno.mod exists in the root directory
    const gnoModPath = `${rootDir}/gno.mod`;
    const gnoModExists = await vscode.workspace.fs
      .stat(vscode.Uri.file(gnoModPath))
      .then(
        () => true,
        () => false,
      );

    if (!gnoModExists) {
      vscode.window.showWarningMessage("gno.mod.tidy: gno.mod not found");
      return;
    }

    return runModTidy(rootDir)
      .then(() => {
        globalChannel.appendLine(`${dayjs().format()} gno.mod.tidy: Done!`);
        globalChannel.show();
        return null;
      })
      .catch((err: any) => {
        globalChannel.appendLine(`${dayjs().format()} gno.mod.tidy: ${err}`);
        globalChannel.show();
        vscode.window.showErrorMessage(err || "gno.mod.tidy: Unknown error");
        return err;
      });
  };
};

/**
 * Runs the 'gno mod tidy' command in the provided workspace folder.
 *
 * @param rootDir The workspace root directory where the command will be run.
 * @returns errorMessage in case the method fails, null otherwise
 */
function runModTidy(rootDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const gno = getBinPath("gno");
    const tidyFlags = ["mod", "tidy"];

    cp.execFile(gno, tidyFlags, { cwd: rootDir }, (err, stdout, stderr) => {
      if (err && (<any>err).code === "ENOENT") {
        promptForMissingTool(gno);
        return reject();
      }
      if (err) {
        return reject(stderr || err.message);
      }
      resolve();
    });
  });
}

