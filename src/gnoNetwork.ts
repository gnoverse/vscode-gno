import vscode = require('vscode');
import { CommandFactory } from './commands';
import { getGnoConfig } from './config';
import { isGoFile } from './gnoMode';

/**
 * A chain that transactions and queries are sent to, from `gno.networks`.
 */
export interface GnoNetwork {
	name: string;
	remote: string;
	chainId: string;
	gnoweb?: string;
}

function getNetworks(): GnoNetwork[] {
	const networks = getGnoConfig().get<Record<string, Omit<GnoNetwork, 'name'>>>('networks') ?? {};
	return Object.entries(networks).map(([name, n]) => ({ name, ...n }));
}

function selectedName(): string {
	return getGnoConfig().get<string>('network') ?? '';
}

function describe(n: GnoNetwork): string {
	return `${n.remote} (chain ID ${n.chainId})`;
}

/**
 * Returns the network named by `gno.network`, or undefined when it is not in
 * `gno.networks`.
 */
export function getSelectedNetwork(): GnoNetwork | undefined {
	const name = selectedName();
	return getNetworks().find((n) => n.name === name);
}

/**
 * Returns the selected network for a chain command. When it is not in
 * `gno.networks`, shows an error with an action to select another network and
 * returns undefined.
 */
export function requireSelectedNetwork(): GnoNetwork | undefined {
	const network = getSelectedNetwork();
	if (!network) {
		vscode.window
			.showErrorMessage(`Network "${selectedName()}" is not in gno.networks.`, 'Select Network')
			.then((action) => action && vscode.commands.executeCommand('gno.network.select'));
	}
	return network;
}

export const selectNetwork: CommandFactory = () => async () => {
	const current = selectedName();
	const picked = await vscode.window.showQuickPick(
		getNetworks().map((n) => ({
			label: n.name,
			description: `${n.name === current ? '$(check) ' : ''}${describe(n)}`
		})),
		{ placeHolder: 'Select the network for Gno transactions and queries' }
	);
	if (picked) {
		const target = vscode.workspace.workspaceFolders
			? vscode.ConfigurationTarget.Workspace
			: vscode.ConfigurationTarget.Global;
		await getGnoConfig().update('network', picked.label, target);
	}
};

/**
 * Shows the selected network in the status bar while a Gno file is open.
 */
export function setupNetworkStatusBar(ctx: vscode.ExtensionContext) {
	const item = vscode.window.createStatusBarItem('gno.network', vscode.StatusBarAlignment.Right, 100);
	item.name = 'Gno Network';
	item.command = 'gno.network.select';

	const update = () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || !isGoFile(editor.document)) {
			item.hide();
			return;
		}
		const network = getSelectedNetwork();
		if (network) {
			item.text = `$(globe) ${network.name}`;
			item.tooltip = `Gno network: ${describe(network)}. Click to change.`;
			item.backgroundColor = undefined;
		} else {
			item.text = `$(globe) ${selectedName()}?`;
			item.tooltip = 'The selected network is not in gno.networks. Click to select another one.';
			item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
		}
		item.show();
	};

	ctx.subscriptions.push(
		item,
		vscode.window.onDidChangeActiveTextEditor(update),
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('gno.networks') || e.affectsConfiguration('gno.network')) {
				update();
			}
		})
	);
	update();
}
