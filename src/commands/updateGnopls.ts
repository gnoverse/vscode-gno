import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { CommandFactory } from ".";

export const updateGnoplsBinary: CommandFactory = (ctx, gnoCtx) => {
  return async () => {
    try {
      const extension = vscode.extensions.getExtension("gnoland.vscode-gno");
      if (!extension) {
        vscode.window.showErrorMessage("Extension path not found");
        return new Error("Extension not found");
      }

      const extensionPath = extension.extensionPath;

      // Path to gno_functions folder inside the extension
      const gnoFunctionsDir = path.join(
        extensionPath,
        "gnopls",
        "gno_functions",
      );

      if (!fs.existsSync(gnoFunctionsDir)) {
        vscode.window.showErrorMessage(
          `The gno_functions folder was not found in the location ${gnoFunctionsDir}`,
        );
        return new Error("Folder gno_functions not found");
      }

      // Path to Makefile directory
      const makefileDir = path.join(extensionPath, "gnopls");

      const makefilePath = path.join(makefileDir, "Makefile");
      if (!fs.existsSync(makefilePath)) {
        vscode.window.showErrorMessage(
          `Makefile not found at location ${makefilePath}`,
        );
        return new Error("Makefile not found");
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Update gnopls binary...",
          cancellable: false,
        },
        async (progress) => {
          // Step 1: Update gno_functions via git pull
          progress.report({ message: "Update gno_functions..." });
          await new Promise<void>((resolve, reject) => {
            const gitPullProcess = cp.exec(
              "git pull",
              { cwd: gnoFunctionsDir },
              (error, stdout, stderr) => {
                if (error) {
                  vscode.window.showErrorMessage(
                    `Error running git pull: ${stderr || error.message}`,
                  );
                  reject(error);
                  return;
                }
                console.log(`[git pull stdout]: ${stdout}`);
                console.log(`[git pull stderr]: ${stderr}`);
                resolve();
              },
            );

            gitPullProcess.stdout?.on("data", (data) => {
              console.log(`[git pull stdout]: ${data}`);
            });

            gitPullProcess.stderr?.on("data", (data) => {
              console.error(`[git pull stderr]: ${data}`);
            });
          });

          // Step 2: Compile gnopls binary
          progress.report({ message: "Compiling gnopls binary..." });
          await new Promise<void>((resolve, reject) => {
            const makeProcess = cp.exec(
              "make build",
              { cwd: makefileDir },
              (error, stdout, stderr) => {
                if (error) {
                  vscode.window.showErrorMessage(
                    `Error executing Makefile: ${stderr || error.message}`,
                  );
                  reject(error);
                  return;
                }
                console.log(`[make stdout]: ${stdout}`);
                console.log(`[make stderr]: ${stderr}`);
                vscode.window.showInformationMessage(
                  `Gnopls binary updated successfully!`,
                );
                resolve();
              },
            );

            makeProcess.stdout?.on("data", (data) => {
              console.log(`[make stdout]: ${data}`);
            });

            makeProcess.stderr?.on("data", (data) => {
              console.error(`[make stderr]: ${data}`);
            });
          });
        },
      );
    } catch (err) {
      vscode.window.showErrorMessage(`Error updating gnopls: ${err}`);
      return new Error(`Error updating gnopls : ${err}`);
    }
  };
};
