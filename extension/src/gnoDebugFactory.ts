import * as vscode from 'vscode';

export class GnoDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
	constructor(private outputChannel: vscode.OutputChannel) {}
	public createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		// if use extern DAP server
		if (session.configuration.remote) {
			const host = session.configuration.host || '127.0.0.1';
			const port = session.configuration.port || 2345;
			this.outputChannel.appendLine(`Connecting to Gno debug server at ${host}:${port}`);
			return new vscode.DebugAdapterServer(port, host);
		}

		// if use intern adapter
		const command = 'node';
		const args = [vscode.extensions.getExtension('gno.debug')!.extensionPath + '/out/debugAdapter.js'];
		this.outputChannel.appendLine(`Starting Gno debug adapter: ${command} ${args.join(' ')}`);

		return new vscode.DebugAdapterExecutable(command, args);
	}
}