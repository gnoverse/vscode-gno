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
			stopGnoDevServer();

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

			// Get gnodev flags from configuration
			const config = vscode.workspace.getConfiguration('gno');
			const gnodevFlags: string[] = config.get('gnodevFlags', []);

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
				if (output.includes('gnoweb started')) {
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

			vscode.window.showInformationMessage('Gno development server started! Opening in Simple Browser...');
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			outputChannel.appendLine(`Error starting gnodev: ${errorMessage}`);
			vscode.window.showErrorMessage(`Failed to start gnodev: ${errorMessage}`);
		}
	};
};

// Export function to stop the server (can be used by other commands if needed)
function stopGnoDevServer(): boolean {
	if (currentGnoDevProcess) {
		currentGnoDevProcess.dispose();
		currentGnoDevProcess = undefined;
		return true;
	}
	return false;
}

export const stopGnoDevServerCommand: CommandFactory = () => {
	return async () => {
		if (stopGnoDevServer()) {
			outputChannel.appendLine('Gno development server stopped.');
			vscode.window.showInformationMessage('Gno development server stopped.');
		} else {
			vscode.window.showInformationMessage('No Gno development server is currently running.');
		}
	};
};
