import * as vscode from "vscode";
import cp from "child_process";
import { CommandFactory } from ".";
import { getBinPath, promptForMissingTool } from "../util";
import { globalChannel } from "../global";
import dayjs from "dayjs";

export const modInit: CommandFactory = (ctx, gnoCtx) => {
  return async () => {
    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders === undefined || wsFolders?.length === 0) {
      vscode.window.showErrorMessage(
        "gno.mod.init: cannot get workspace folder",
      );
      return new Error("gno.mod.init: cannot get workspace folder");
    }
    const rootDir = wsFolders?.[0].uri.fsPath;
    vscode.window
      .showInputBox({
        prompt: "Enter package name",
        value: "gno.land/",
        validateInput: (value) => {
          if (!value.startsWith("gno.land/")) {
            return "should start with gno.land/r/ or gno.land/r/";
          }
          return null;
        },
      })
      .then((modPath) => {
        if (modPath === undefined) {
          modPath = "";
        }
        return runGnoModInit(rootDir, modPath);
      });
  };
};

function runGnoModInit(rootDir: string, modPath: string): Thenable<void> {
  return new Promise((resolve, reject) => {
    const gno = getBinPath("gno");
    const gnoModInitFlags = ["mod", "init"];
    if (modPath !== "") {
      gnoModInitFlags.push(modPath);
    }
    cp.execFile(
      gno,
      gnoModInitFlags,
      { cwd: rootDir },
      (err, stdout, stderr) => {
        if (err && (<any>err).code === "ENOENT") {
          promptForMissingTool(gno);
          return reject();
        }
        if (err) {
          globalChannel.append(`${dayjs().format()} gno.mod.init: ${stderr}`);
          globalChannel.show();
          vscode.window.showErrorMessage(stderr || err.message);
          return reject(stderr);
        }
        globalChannel.appendLine(`${dayjs().format()} gno.mod.init: Done!`);
        globalChannel.show();
        return resolve();
      },
    );
  });
}
