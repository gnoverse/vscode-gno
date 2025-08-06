import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { joinPath } from '../util';
import { defaultGroup, outputChannel } from './logs';
import { GnodevAddress } from './address';
import path from 'path';

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
		if (this._panel && this._currAddr?.equals(addr)) {
			this._panel.reveal();
			return;
		}
		this._currAddr = addr;

		// Init the webview panel on the specified column.
		this._panel = vscode.window.createWebviewPanel('gnodev', 'Gnodev', viewColumn, {
			enableScripts: true,
			enableForms: true,
			retainContextWhenHidden: true,
			localResourceRoots: [joinPath(this._context.extensionUri, 'media')]
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
		const externalUri = (await vscode.env.asExternalUri(this._currAddr.toUri())).toString();
		outputChannel.info(defaultGroup, 'opening gnodev webview', { uri: externalUri });

		// Set up message handling for gnodev controls.
		this._panel.webview.onDidReceiveMessage((e) => {
			switch (e.type) {
				// This control reloads gnodev packages.
				case 'reload':
					fetch(path.join(externalUri, 'reload'));
					break;
				// This control resets the gnodev realms state.
				case 'reset':
					fetch(path.join(externalUri, 'reset'));
					break;
				// This control opens gnodev in the external browser.
				case 'openExternal':
					vscode.env.openExternal(this._currAddr!.toUri());
					break;
			}
		});

		// The webview HTML content includes browser-like navigation controls and gnodev controls.
		this._panel.webview.html = this.getHtml(externalUri);

		// If the webview is closed, call the dispose callback.
		this._panel.onDidDispose(() => {
			this.dispose();
		});
	}

	public dispose(): void {
		if (this._panel) {
			const prevPanel = this._panel;
			this._panel = undefined;

			outputChannel.info(defaultGroup, 'closing gnodev webview');
			prevPanel.dispose();
		}

		if (this._onDidDispose) {
			const prevOnDidDispose = this._onDidDispose;
			this._onDidDispose = undefined;

			prevOnDidDispose();
		}
	}

	private getHtml(url: string): string {
		// Generate URIs for the webview static resources.
		const mainJs = this._panel!.webview.asWebviewUri(
			joinPath(this._context.extensionUri, 'media', 'gnodev-browser.js')
		);
		const mainCss = this._panel!.webview.asWebviewUri(
			joinPath(this._context.extensionUri, 'media', 'gnodev-browser.css')
		);
		const codiconCss = this._panel!.webview.asWebviewUri(
			joinPath(this._context.extensionUri, 'media', 'codicon.css')
		);

		// Return the HTML content for the webview with the necessary resources linked.
		return `
			<!DOCTYPE html>
			<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">

				<link rel="stylesheet" type="text/css" href="${mainCss}">
				<link rel="stylesheet" type="text/css" href="${codiconCss}">
			</head>
			<body>
				<iframe src="${url}" sandbox="allow-scripts allow-forms allow-same-origin"></iframe>

				<div class="floating-controls">
					<button
						title="Back"
						class="back-button icon"><i class="codicon codicon-arrow-left"></i></button>

					<button
						title="Forward"
						class="forward-button icon"><i class="codicon codicon-arrow-right"></i></button>

					<button
						title="Reload"
						class="reload-button icon"><i class="codicon codicon-refresh"></i></button>

					<button
						title="Reset realms state"
						class="reset-button icon"><i class="codicon codicon-clear-all"></i></button>

					<button
						title="Open in browser"
						class="open-external-button icon"><i class="codicon codicon-link-external"></i></button>
				</div>

				<script src="${mainJs}"></script>
			</body>
			</html>`;
	}
}
