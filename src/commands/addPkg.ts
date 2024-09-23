import * as vscode from "vscode";
import cp from "child_process";
import { CommandFactory } from ".";
import { getGnoConfig } from "../config";
import { getBinPath, promptForMissingTool } from "../util";
import { globalChannel } from "../global";
import dayjs from "dayjs";

const GNO_ADD_PKG_COMMAND = "gno.maketx.addpkg";
const ERROR_MESSAGE = "should not be empty";
const GNOLAND_PREFIX = "gno.land/";

export const addPkg: CommandFactory = (ctx, gnoCtx) => {
  return async () => {
    try {
      // Get the root directory of the workspace
      const rootDir = await getWorkspaceRootDir();
      // Prompt the user for necessary inputs
      const pkgDir = await promptUserInput(
        "Enter package dir",
        rootDir,
        ERROR_MESSAGE,
      );
      const pkgPath = await promptUserInput(
        "Enter package name",
        GNOLAND_PREFIX,
        `should start with ${GNOLAND_PREFIX}`,
      );
      const deposit = await promptUserInput(
        "Enter deposit amount",
        "10000000ugnot",
        "amount should be in ugnot",
      );
      const remote = await promptUserInput(
        "Enter remote URL",
        "localhost:26657",
        ERROR_MESSAGE,
      );
      const keyname = await promptUserInput(
        "Enter key name",
        "",
        ERROR_MESSAGE,
      );
      const password = await promptUserInput(
        "Enter password",
        "",
        undefined,
        true,
      );

      // Retrieve makeTx configuration
      const config = getGnoConfig();
      const makeTxConfig = config.get<{ [key: string]: any }>("makeTx");
      const broadcast = makeTxConfig?.broadcast ?? true;
      const gasFee = makeTxConfig?.gasFee ?? "1000000ugnot";
      const gasWanted = makeTxConfig?.gasWanted ?? "2000000";

      // Run the addpkg command with the collected inputs
      await runMaketxAddpkg(
        rootDir,
        pkgDir,
        pkgPath,
        deposit,
        gasFee,
        gasWanted,
        broadcast,
        remote,
        keyname,
        password,
      );
      return null;
    } catch (error) {
      if (error instanceof Error) {
        vscode.window.showErrorMessage(
          `${GNO_ADD_PKG_COMMAND}: ${error.message}`,
        );
      } else {
        vscode.window.showErrorMessage(
          `${GNO_ADD_PKG_COMMAND}: An unknown error occurred`,
        );
      }
      return error;
    }
  };
};

// Retrieves the root directory of the workspace
async function getWorkspaceRootDir(): Promise<string> {
  const wsFolders = vscode.workspace.workspaceFolders;
  if (!wsFolders || wsFolders.length === 0) {
    vscode.window.showErrorMessage(
      `${GNO_ADD_PKG_COMMAND}: Please open a folder or workspace in VSCode before running this command.`,
    );
    throw new Error(`${GNO_ADD_PKG_COMMAND}: cannot get workspace folder`);
  }
  return wsFolders[0].uri.fsPath;
}

// Prompt the user for input with validation and returns the input string
async function promptUserInput(
  prompt: string,
  defaultValue: string,
  validationMessage: string | undefined,
  isPassword: boolean = false,
): Promise<string> {
  const input = await vscode.window.showInputBox({
    prompt,
    value: defaultValue,
    password: isPassword,
    validateInput: (value) => (value.length === 0 ? validationMessage : null),
  });
  if (!input) {
    throw new Error(
      `${GNO_ADD_PKG_COMMAND}: cannot get ${prompt.toLowerCase()}`,
    );
  }
  return input;
}

// Executes the gno.maketx.addpkg command by spawning a child process
async function runMaketxAddpkg(
  rootDir: string,
  pkgDir: string,
  pkgPath: string,
  deposit: string,
  gasFee: string,
  gasWanted: string,
  broadcast: boolean,
  remote: string,
  keyname: string,
  password: string,
): Promise<void> {
  const gnokey = getBinPath("gnokey");
  const args = buildGnokeyArgs(
    pkgPath,
    pkgDir,
    deposit,
    gasFee,
    gasWanted,
    broadcast,
    remote,
    keyname,
  );

  globalChannel.show();
  globalChannel.appendLine(
    `${dayjs().format()} ${GNO_ADD_PKG_COMMAND}: ${gnokey} ${args.join(" ")}`,
  );

  return new Promise<void>((resolve, reject) => {
    const child = cp.spawn(gnokey, args, { cwd: rootDir });

    // Handle stderr data and prompt for password if necessary
    child.stderr.on("data", (data) =>
      handleChildProcessOutput(data, password, child),
    );

    // Log stdout data to the global channel
    child.stdout.on("data", (data) =>
      globalChannel.appendLine(
        `${dayjs().format()} ${GNO_ADD_PKG_COMMAND}: ${data}`,
      ),
    );

    // Handle errors during the execution of the command
    child.on("error", (err) => {
      if (err instanceof Error && (err as any).code === "ENOENT") {
        promptForMissingTool(gnokey);
      }
      reject(
        new Error(`${GNO_ADD_PKG_COMMAND} failed with error: ${err.message}`),
      );
    });

    // Resolve or reject the promise based on the exit code
    child.on("exit", (code) => {
      if (code === 0) {
        globalChannel.appendLine(`${GNO_ADD_PKG_COMMAND}: Done!`);
        resolve();
      } else {
        globalChannel.appendLine(`${GNO_ADD_PKG_COMMAND}: Failed!`);
        reject(
          new Error(`${GNO_ADD_PKG_COMMAND} failed with exit code ${code}`),
        );
      }
    });
  });
}

// Builds the argument list for the gnokey command
function buildGnokeyArgs(
  pkgPath: string,
  pkgDir: string,
  deposit: string,
  gasFee: string,
  gasWanted: string,
  broadcast: boolean,
  remote: string,
  keyname: string,
): string[] {
  const args = [
    "maketx",
    "addpkg",
    "-pkgpath",
    pkgPath,
    "-pkgdir",
    pkgDir,
    "-deposit",
    deposit,
    "-gas-fee",
    gasFee,
    "-gas-wanted",
    gasWanted,
  ];
  if (broadcast) {
    args.push("-broadcast");
  }
  args.push("-remote", remote, "-insecure-password-stdin", keyname);
  return args;
}

// Handles the child process output and writes the password to stdin if prompted
function handleChildProcessOutput(
  data: any,
  password: string,
  child: cp.ChildProcess,
) {
  const output = data.toString();
  globalChannel.appendLine(
    `${dayjs().format()} ${GNO_ADD_PKG_COMMAND}: ${output}`,
  );
  if (output.startsWith("Enter password") && child.stdin) {
    child.stdin.write(`${password}\n`);
  }
}
