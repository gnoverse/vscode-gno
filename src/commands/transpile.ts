import * as vscode from "vscode";
import cp from "child_process";
import * as util from "../util";
import { dirname } from "path";
import { CommandFactory } from ".";
import { globalChannel } from "../global";
import dayjs from "dayjs";

export const transpile: CommandFactory = (ctx, gnoCtx) => {
  return async (calledOnSave: boolean = false) => {
    globalChannel.clear();

    const activeEditor = vscode.window.activeTextEditor;
    if (
      activeEditor == undefined ||
      activeEditor?.document.languageId !== "gno"
    ) {
      vscode.window.showErrorMessage("gno.transpile: not a .gno file");
      return new Error("gno.transpile: not a .gno file");
    }

    let filename = activeEditor?.document.fileName;
    if (filename === undefined) {
      vscode.window.showErrorMessage("gno.transpile: cannot get filename");
      return new Error("gno.transpile: cannot get filename");
    }

    return await runGnoTranspile(filename, calledOnSave)
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
function runGnoTranspile(
  fileName: string,
  calledOnSave: boolean,
): Thenable<void> {
  return new Promise((resolve, reject) => {
    const gno = util.getBinPath("gno");
    const gnoFlags = ["transpile", dirname(fileName)];
    cp.execFile(
      gno,
      gnoFlags,
      { cwd: dirname(fileName) },
      (err, stdout, stderr) => {
        if (err && (<any>err).code === "ENOENT") {
          util.promptForMissingTool(gno);
          return reject();
        }
        if (err) {
          globalChannel.append(`${dayjs().format()} gno.transpile: ${stderr}`);
          globalChannel.show();
          vscode.window.showErrorMessage(stderr || err.message);
          return reject(stderr);
        }
        if (!calledOnSave) {
          globalChannel.show();
          globalChannel.appendLine(`${dayjs().format()} gno.transpile: Done!`);
        }
        return resolve();
      },
    );
  });
}
