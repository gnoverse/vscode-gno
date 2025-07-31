import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { CommandFactory } from './index';
import { outputChannel } from '../gnoStatus';
import { getBinPath } from '../util';

interface GnoDevProcess {
	process: ChildProcess;
	dispose: () => void;
}

let currentGnoDevProcess: GnoDevProcess | undefined;

export const startGnoDevServer: CommandFactory = () => {
	return async () => {
		try {
			// Stop any existing gnodev process
			_stopGnoDevServer(true);

			// Get the current workspace folder
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage(
					'No workspace folder found. Please open a workspace to start the development server.'
				);
				return;
			}

			// Get the gno binary path
			const gnodevBinPath = getBinPath('gnodev');

			// Get gnodev flags and browser setting from configuration
			const config = vscode.workspace.getConfiguration('gno');
			const gnodevFlags: string[] = config.get('gnodevFlags', []);
			const openBrowser: boolean = config.get('gnodevOpenBrowser', true);

			outputChannel.show();
			outputChannel.appendLine('Starting Gno development server...');

			// Build command arguments: ['dev', ...flags]
			const args = ['dev', ...gnodevFlags];

			// Start gnodev process
			const gnodevProcess = spawn(gnodevBinPath, args, {
				cwd: workspaceFolder.uri.fsPath,
				stdio: ['pipe', 'pipe', 'pipe']
			});

			// Handle process output
			gnodevProcess.stdout?.on('data', (data: Buffer) => {
				const output = data.toString();
				outputChannel.appendLine(output);

				// Check if server is ready (look for the READY message)
				if (output.includes('gnoweb started') && openBrowser) {
					// Open Simple Browser after a short delay to ensure server is fully ready
					setTimeout(() => {
						vscode.commands.executeCommand('simpleBrowser.show', 'http://127.0.0.1:8888');
					}, 50);
				}
			});

			gnodevProcess.stderr?.on('data', (data: Buffer) => {
				outputChannel.appendLine(`Error: ${data.toString()}`);
			});

			gnodevProcess.on('error', (error) => {
				outputChannel.appendLine(`Failed to start gnodev: ${error.message}`);
				vscode.window.showErrorMessage(`Failed to start gnodev: ${error.message}`);
				currentGnoDevProcess = undefined;
			});

			gnodevProcess.on('exit', (code, signal) => {
				outputChannel.appendLine(`Gnodev process exited with code ${code}, signal ${signal}`);
				currentGnoDevProcess = undefined;
			});

			// Create disposal function
			const dispose = () => {
				if (gnodevProcess && !gnodevProcess.killed) {
					outputChannel.appendLine('Stopping Gno development server...');
					gnodevProcess.kill();
				}
			};

			currentGnoDevProcess = {
				process: gnodevProcess,
				dispose
			};

			const message = openBrowser
				? 'Gno development server started! Opening in Simple Browser...'
				: 'Gno development server started!';
			vscode.window.showInformationMessage(message);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			outputChannel.appendLine(`Error starting gnodev: ${errorMessage}`);
			vscode.window.showErrorMessage(`Failed to start gnodev: ${errorMessage}`);
		}
	};
};

export const stopGnoDevServer: CommandFactory = () => {
	return async () => {
		_stopGnoDevServer(false);
	};
};

const _stopGnoDevServer = (quiet = false): void => {
	if (currentGnoDevProcess) {
		currentGnoDevProcess.dispose();
		currentGnoDevProcess = undefined;
		if (!quiet) {
			outputChannel.appendLine('Gno development server stopped.');
			vscode.window.showInformationMessage('Gno development server stopped.');
		}
	} else if (!quiet) {
		vscode.window.showInformationMessage('No Gno development server is currently running.');
	}
};
