import * as vscode from 'vscode';

export class GnoDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
	resolveDebugConfiguration(
		folder: vscode.WorkspaceFolder | undefined,
		config: vscode.DebugConfiguration,
		token?: vscode.CancellationToken
	): vscode.ProviderResult<vscode.DebugConfiguration> {
		// Config by default
		if (!config.type && !config.request && !config.name) {
			config.type = 'gno';
			config.name = 'Launch Gno Debugger';
			config.request = 'launch';
			config.program = '${file}';
		}
		return config;
	}
}