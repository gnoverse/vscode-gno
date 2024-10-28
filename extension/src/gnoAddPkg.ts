import path = require('path');
import vscode = require('vscode');
import cp = require('child_process');
import { CommandFactory } from './commands';
import { getGnoConfig } from './config';
import { toolExecutionEnvironment } from './gnoEnv';
import { getBinPath } from './util';
import { diagnosticsStatusBarItem, outputChannel } from './gnoStatus';

// Constants
const GNO_ADD_PKG_COMMAND = 'gno.maketx.addpkg';
const ERROR_MESSAGE = 'should not be empty';
const GNOLAND_PREFIX = 'gno.land/';

/**
 * Adds a new package to the Gno blockchain.
 */
export function addPackage(): CommandFactory {
	return (ctx, goCtx) => async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No editor is active, cannot determine workspace context');
			return;
		}

		const documentUri = editor.document.uri;
		const goConfig = getGnoConfig(documentUri);

		diagnosticsStatusBarItem.show();
		diagnosticsStatusBarItem.text = 'Adding package...';

		try {
			await executeAddPackage(documentUri, goConfig);
			diagnosticsStatusBarItem.hide();
		} catch (err) {
			vscode.window.showInformationMessage('Error: ' + err);
			diagnosticsStatusBarItem.text = 'Add Package Failed';
		}
	};
}

/**
 * Executes the add package operation with proper error handling and status updates.
 *
 * @param fileUri Document uri.
 * @param goConfig Configuration for the Go extension.
 */
async function executeAddPackage(
	fileUri: vscode.Uri,
	goConfig: vscode.WorkspaceConfiguration
): Promise<void> {
	const rootDir = await getWorkspaceRootDir();

	// Collect user inputs
	const inputs = await collectUserInputs(rootDir);

	// Get makeTx configuration
	const makeTxConfig = goConfig.get<{ [key: string]: any }>('makeTx');
	const configOptions = {
		broadcast: makeTxConfig?.broadcast ?? true,
		gasFee: makeTxConfig?.gasFee ?? '1000000ugnot',
		gasWanted: makeTxConfig?.gasWanted ?? '2000000'
	};

	outputChannel.appendLine(`Starting add package operation in ${rootDir}`);

	const buildEnv = toolExecutionEnvironment();

	// Execute the gnokey command
	await runGnokeyCommand(
		rootDir,
		inputs,
        configOptions,
        buildEnv
	);
}

/**
 * Gets the workspace root directory.
 */
async function getWorkspaceRootDir(): Promise<string> {
    const wsFolders = vscode.workspace.workspaceFolders;
    if (!wsFolders || wsFolders.length === 0) {
        throw new Error(`${GNO_ADD_PKG_COMMAND}: No workspace folder found`);
    }
    return wsFolders[0].uri.fsPath;
}

/**
 * Collects all necessary user inputs through prompts.
 */
async function collectUserInputs(rootDir: string) {
	const pkgDir = await promptUserInput('Enter package dir', rootDir, ERROR_MESSAGE, false);
	const pkgPath = await promptUserInput('Enter package name', GNOLAND_PREFIX, `should start with ${GNOLAND_PREFIX}`, false);
	const deposit = await promptUserInput('Enter deposit amount', '10000000ugnot', 'amount should be in ugnot', false);
	const remote = await promptUserInput('Enter remote URL', 'localhost:26657', ERROR_MESSAGE, false);
	const keyname = await promptUserInput('Enter key name', '', ERROR_MESSAGE, false);
	const password = await promptUserInput('Enter password', '', undefined, true);

	return { pkgDir, pkgPath, deposit, remote, keyname, password };
}

/**
 * Prompts the user for input with validation.
 */
async function promptUserInput(
    prompt: string,
    defaultValue: string,
    validationMessage: string | undefined,
    isPassword: boolean
): Promise<string> {
    const input = await vscode.window.showInputBox({
        prompt,
        value: defaultValue,
        password: isPassword,
        validateInput: (value) => {
            if (isPassword) {
                return null;
            }

            return value.length === 0 ? validationMessage : null;
        }
    });

    if (!isPassword && input === undefined) {
        throw new Error(`${GNO_ADD_PKG_COMMAND}: ${prompt} is required`);
    }

    return input ?? '';
}

/**
 * Executes the gnokey command with the provided parameters.
 */
async function runGnokeyCommand(
    rootDir: string,
    inputs: {
        pkgDir: string;
        pkgPath: string;
        deposit: string;
        remote: string;
        keyname: string;
        password: string;
    },
    config: {
        broadcast: boolean;
        gasFee: string;
        gasWanted: string;
    },
    env: NodeJS.ProcessEnv
): Promise<void> {
    const gnokey = getBinPath('gnokey');
    if (!gnokey) {
        throw new Error(`${GNO_ADD_PKG_COMMAND}: gnokey binary not found`);
    }

    const args = [
        'maketx',
        'addpkg',
        '-pkgpath', inputs.pkgPath,
        '-pkgdir', inputs.pkgDir,
        '-deposit', inputs.deposit,
        '-gas-fee', config.gasFee,
        '-gas-wanted', config.gasWanted
    ];

    if (config.broadcast) {
        args.push('-broadcast');
    }

    args.push('-remote', inputs.remote, '-insecure-password-stdin', inputs.keyname);

    outputChannel.appendLine(`${GNO_ADD_PKG_COMMAND}: executing ${gnokey} ${args.join(' ')}`);

    return new Promise<void>((resolve, reject) => {
        const child = cp.spawn(gnokey, args, { 
            cwd: rootDir,
            env: env
        });

        child.stderr.on('data', (data) => {
            const output = data.toString();
            outputChannel.appendLine(`${GNO_ADD_PKG_COMMAND}: ${output}`);
            if (output.startsWith('Enter password') && child.stdin) {
                child.stdin.write(`${inputs.password}\n`);
            }
        });

        child.stdout.on('data', (data) => {
            outputChannel.appendLine(`${GNO_ADD_PKG_COMMAND}: ${data}`);
        });

        child.on('error', (err) => {
            reject(new Error(`${GNO_ADD_PKG_COMMAND} failed: ${err.message}`));
        });

        child.on('exit', (code) => {
            if (code === 0) {
                outputChannel.appendLine(`${GNO_ADD_PKG_COMMAND}: Successfully added package`);
                resolve();
            } else {
                reject(new Error(`${GNO_ADD_PKG_COMMAND} failed with exit code ${code}`));
            }
        });
    });
}