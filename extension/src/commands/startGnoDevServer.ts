import * as vscode from 'vscode';
import { CommandFactory } from './index';
import { GnodevProcess, GnodevAddress, restartDelay } from '../gnodev/gnodevProcess';
import { GnodevWebView } from '../gnodev/gnodevWebView';

interface GnoDevServer {
	process: GnodevProcess;
	webview?: GnodevWebView;
}

let currentGnoDevServer: GnoDevServer | undefined;

export const startGnoDevServer: CommandFactory = (ctx) => {
	return async () => {
		try {
			// If a gnodev server is already running, dispose of it before starting a new one.
			if (currentGnoDevServer) {
				disposeGnoDevServer();
				await new Promise((resolve) => setTimeout(resolve, restartDelay));
			}

			// Init the gnodev process.
			currentGnoDevServer = { process: new GnodevProcess() };

			// When the gnodev process is ready, open the webview if configured to do so.
			currentGnoDevServer.process.onProcessReady((addr: GnodevAddress) => {
				// Get the openBrowser setting to determine if the webview should be opened.
				const config = vscode.workspace.getConfiguration('gno');
				const openBrowser: boolean = config.get('gnodevOpenBrowser', true);

				// If the openBrowser setting is true, create and show the webview.
				if (openBrowser && currentGnoDevServer) {
					currentGnoDevServer.webview = new GnodevWebView(ctx);
					currentGnoDevServer.webview.onDidDispose(disposeGnoDevServer);
					currentGnoDevServer.webview.create(addr);
				}

				vscode.window.showInformationMessage(`Gnodev server started successfully at: ${addr.toString()}`);
			});

			// When the gnodev process exits, dispose of if.
			currentGnoDevServer.process.onProcessExit((error: Error | undefined) => {
				disposeGnoDevServer();

				if (error) {
					vscode.window.showErrorMessage(`Gnodev server stopped with error: ${error.message}`);
				} else {
					vscode.window.showInformationMessage('Gnodev server stopped successfully.');
				}
			});

			// Start the gnodev process.
			await currentGnoDevServer.process.start();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			vscode.window.showErrorMessage(`Failed to start gnodev: ${errorMessage}`);
		}
	};
};

export const stopGnoDevServer: CommandFactory = () => {
	return async () => {
		if (currentGnoDevServer) {
			disposeGnoDevServer();
		} else {
			vscode.window.showInformationMessage('No gnodev server is currently running.');
		}
	};
};

export const disposeGnoDevServer = () => {
	currentGnoDevServer?.process.dispose();
	currentGnoDevServer?.webview?.dispose();
	currentGnoDevServer = undefined;
};
