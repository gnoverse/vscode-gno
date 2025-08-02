import * as vscode from 'vscode';
import { CommandFactory } from './index';
import { GnodevProcess } from '../gnodev/gnodevProcess';
import { GnodevAddress } from '../gnodev/address';
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
			}

			// Init the gnodev process.
			currentGnoDevServer = { process: new GnodevProcess() };

			// When the gnodev process is ready, open the webview if configured to do so.
			currentGnoDevServer.process.onProcessReady((addr: GnodevAddress) => {
				// Get the openBrowser setting to determine how the gnodev interface should be opened.
				const config = vscode.workspace.getConfiguration('gno');
				const openBrowser: string = config.get('gnodev.openBrowser', 'beside');

				// Handle the different openBrowser options.
				if (openBrowser !== 'none' && currentGnoDevServer) {
					if (openBrowser === 'external') {
						// Open in external browser
						vscode.env.openExternal(addr.toUri());
					} else {
						// Open in webview (current or beside)
						currentGnoDevServer.webview = new GnodevWebView(ctx);
						currentGnoDevServer.webview.onDidDispose(disposeGnoDevServer);
						currentGnoDevServer.webview.create(
							addr,
							openBrowser === 'current' ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside
						);
					}
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
		if (!currentGnoDevServer) {
			vscode.window.showInformationMessage('No gnodev server is currently running.');
			return;
		}

		disposeGnoDevServer();
	};
};

export const disposeGnoDevServer = () => {
	if (currentGnoDevServer) {
		const prevGnoDevServer = currentGnoDevServer;
		currentGnoDevServer = undefined;

		prevGnoDevServer.process.dispose();
		prevGnoDevServer.webview?.dispose();
	}
};
