import * as vscode from 'vscode';
import { joinPath } from '../util';
import { GnodevAddress } from './gnodevProcess';
import { outputChannel } from '../gnoStatus';

export class GnodevWebView extends vscode.Disposable {
	private _context: vscode.ExtensionContext;
	private _panel: vscode.WebviewPanel | undefined;
	private _currAddr: GnodevAddress | undefined;
	private _onDidDispose: (() => void) | undefined;

	constructor(context: vscode.ExtensionContext) {
		super(() => this.dispose());
		this._context = context;
	}

	public get panel(): vscode.WebviewPanel | undefined {
		return this._panel;
	}

	public onDidDispose(callback: () => void): void {
		this._onDidDispose = callback;
	}

	public async create(addr: GnodevAddress, viewColumn: vscode.ViewColumn): Promise<void> {
		// If the webview panel for this gnodev address already exists, just reveal it.
		if (this._panel && this._currAddr?.compareTo(addr)) {
			this._panel.reveal();
			return;
		}
		this._currAddr = addr;

		// Init the webview panel on the specified column.
		this._panel = vscode.window.createWebviewPanel('gnodev', 'Gnodev', viewColumn, {
			enableScripts: true,
			retainContextWhenHidden: true
		});

		// Set the webview icons.
		this._panel.iconPath = {
			light: joinPath(this._context.extensionUri, 'media', 'gno-logo-light.png'),
			dark: joinPath(this._context.extensionUri, 'media', 'gno-logo-dark.png')
		};

		// Workaround for the gnodev server not being accessible via localhost on macOS if IPv6 is enabled.
		if (this._currAddr.host === 'localhost' && process.platform === 'darwin') {
			this._currAddr.host = '127.0.0.1';
		}

		// Using `vscode.env.asExternalUri` to ensure the URL is accessible when running in Codespaces.
		const gnodevURL = await vscode.env.asExternalUri(this._currAddr.toUri());
		outputChannel.info(`Opening gnodev webview at: ${gnodevURL}`);

		// The webview HTML content is just an iframe pointing to the gnodev server URL.
		this._panel.webview.html = `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<style>
					body, html {
						margin: 0;
						padding: 0;
						width: 100%;
						height: 100%;
						overflow: hidden;
					}
					iframe {
						width: 100%;
						height: 100vh;
						border: none;
					}
				</style>
			</head>
			<body>
				<iframe
					src="${gnodevURL}"
					sandbox="allow-scripts allow-forms allow-same-origin allow-downloads">
				</iframe>
			</body>
			</html>
		`;

		// If the webview is closed, call the dispose callback.
		this._panel.onDidDispose(() => {
			this.dispose();
		});
	}

	public dispose(): void {
		if (this._panel) {
			const prevPanel = this._panel;
			this._panel = undefined;

			outputChannel.info('Closing gnodev webview');
			prevPanel.dispose();
		}

		if (this._onDidDispose) {
			const prevOnDidDispose = this._onDidDispose;
			this._onDidDispose = undefined;

			prevOnDidDispose();
		}
	}
}
