import * as vscode from "vscode";
import cp from "child_process";
import { CommandFactory } from ".";
import { getBinPath, promptForMissingTool } from "../util";
import { globalChannel } from "../global";
import dayjs from "dayjs";
import { dirname } from "path";

export const clean: CommandFactory = (ctx, gnoCtx) => {
  return async () => {
    globalChannel.clear();

    const activeEditor = vscode.window.activeTextEditor;
    if (
      activeEditor == undefined ||
      activeEditor?.document.languageId !== "gno"
    ) {
      vscode.window.showErrorMessage("gno.clean: not a .gno file");
      return new Error("gno.clean: not a .gno file");
    }

    let filename = activeEditor?.document.fileName;
    if (filename === undefined) {
      vscode.window.showErrorMessage("gno.clean: cannot get filename");
      return new Error("gno.clean: cannot get filename");
    }

    return await runGnoClean(dirname(filename))
      .then((res) => {
        return null;
      })
      .then(undefined, (err) => {
        return err;
      });
  };
};

function runGnoClean(rootDir: string): Thenable<void> {
  return new Promise((resolve, reject) => {
    const gno = getBinPath("gno");
    const gnoCleanFlags = ["clean"];
    cp.execFile(gno, gnoCleanFlags, { cwd: rootDir }, (err, stdout, stderr) => {
      if (err && (<any>err).code === "ENOENT") {
        promptForMissingTool(gno);
        return reject();
      }
      if (err) {
        globalChannel.append(`${dayjs().format()} gno.clean: ${stderr}`);
        globalChannel.show();
        vscode.window.showErrorMessage(stderr || err.message);
        return reject(stderr);
      }
      globalChannel.appendLine(`${dayjs().format()} gno.clean: Done!`);
      globalChannel.show();
      return resolve();
    });
  });
}
