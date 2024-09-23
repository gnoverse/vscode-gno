import * as vscode from "vscode";
import cp from "child_process";
import * as util from "../util";
import { dirname, isAbsolute } from "path";
import { CommandFactory } from ".";
import { globalChannel } from "../global";
import dayjs from "dayjs";

export const format: CommandFactory = (ctx, gnoCtx) => {
  return async (calledOnSave: boolean = false) => {
    globalChannel.clear();

    const activeEditor = vscode.window.activeTextEditor;
    if (
      activeEditor == undefined ||
      activeEditor?.document.languageId !== "gno"
    ) {
      vscode.window.showErrorMessage("gno.format: not a .gno file");
      return new Error("gno.format: not a .gno file");
    }

    let filename = activeEditor?.document.fileName;
    if (filename === undefined) {
      vscode.window.showErrorMessage("gno.format: cannot get filename");
      return new Error("gno.format: cannot get filename");
    }

    return await runGoFumpt(filename, calledOnSave)
      .then((res) => {
        return null;
      })
      .then(undefined, (err) => {
        return err;
      });
  };
};

/**
 * @param fileName name of the activeEditor file
 * @returns errorMessage in case the method fails, null otherwise
 */
function runGoFumpt(fileName: string, calledOnSave: boolean): Thenable<void> {
  return new Promise((resolve, reject) => {
    const gofumpt = util.getBinPath("gofumpt");
    const gofumptFlags = ["-w", fileName];
    cp.execFile(
      gofumpt,
      gofumptFlags,
      { cwd: dirname(fileName) },
      (err, stdout, stderr) => {
        if (err && (<any>err).code === "ENOENT") {
          util.promptForMissingTool(gofumpt);
          return reject();
        }
        if (err) {
          globalChannel.append(`${dayjs().format()} gno.format: ${stderr}`);
          globalChannel.show();
          vscode.window.showErrorMessage(stderr || err.message);
          return reject(stderr);
        }
        if (!calledOnSave) {
          globalChannel.appendLine(`${dayjs().format()} gno.format: Done!`);
          globalChannel.show();
        }
        return resolve();
      },
    );
  });
}
