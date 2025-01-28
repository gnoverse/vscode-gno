import { config } from 'process';
import * as vscode from 'vscode';

export class GnoDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
	static activate(ctx: vscode.ExtensionContext) {
		ctx.subscriptions.push(
			vscode.debug.registerDebugConfigurationProvider('gno', new GnoDebugConfigurationProvider())
		);
	}

	public async provideDebugConfigurations(_folder: vscode.WorkspaceFolder | undefined, _token?: vscode.CancellationToken): Promise<vscode.DebugConfiguration[]> {
		return await this.pickConfiguration();
	}

	private async pickConfiguration(): Promise<vscode.DebugConfiguration[]> {
		const debugConfigurations = [
			{
				label: 'Gno: Launch Program',
				description: 'Run and debug a gno program',
				config: {
					name: 'Launch program',
					type: 'gno',
					request: 'launch',
					program: '${workspaceFolder}/main.gno'
				}
			},
			{
				label: 'Gno: Attach to Process',
				description: 'Attach to a running Gno process',
				config: {
					name: 'Attach to Process',
					type: 'gno',
					request: 'attach',
					processId: '${command:pickProcess}'
				}
			}
		];

		const choice = await vscode.window.showQuickPick(debugConfigurations, {
			placeHolder: 'Choose a Gno debug configuration'
		});

		if (!choice) {
			return [];
		}
		return [choice.config]
	}

	public async resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, debugConfiguration: vscode.DebugConfiguration, _token?: vscode.CancellationToken): Promise<vscode.DebugConfiguration | undefined> {
		if (!debugConfiguration.program && vscode.window.activeTextEditor) {
			debugConfiguration.program = vscode.window.activeTextEditor.document.fileName;
		}

		if (!debugConfiguration.program) {
			await vscode.window.showErrorMessage(
				'No program specified in the debug configuration. Please set the "program" attribute.'
			);
			return undefined
		}

		return debugConfiguration;
	}
}