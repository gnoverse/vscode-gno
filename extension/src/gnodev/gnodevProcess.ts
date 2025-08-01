import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { outputChannel } from '../gnoStatus';
import { getBinPath } from '../util';

export class GnodevAddress {
	public host: string;
	public port: number;

	constructor(host: string, port: number) {
		this.host = host;
		this.port = port;
	}

	public toString(): string {
		return `http://${this.host}:${this.port}`;
	}

	public toUri(): vscode.Uri {
		return vscode.Uri.parse(this.toString());
	}

	public compareTo(other: GnodevAddress): boolean {
		return this.host === other.host && this.port === other.port;
	}
}

export class GnodevProcess extends vscode.Disposable {
	private _process: ChildProcess | undefined;
	private _onProcessReady = new vscode.EventEmitter<GnodevAddress>();
	private _onProcessExit = new vscode.EventEmitter<Error | undefined>();

	public readonly onProcessReady = this._onProcessReady.event;
	public readonly onProcessExit = this._onProcessExit.event;

	constructor() {
		super(() => this.dispose());
	}

	public get process(): ChildProcess | undefined {
		return this._process;
	}

	public get isRunning(): boolean {
		return this._process?.killed === false;
	}

	public async start(): Promise<void> {
		// If the process is already running, stop it first.
		if (this.isRunning) {
			this.stop();
		}

		outputChannel.info('Starting gnodev process...');

		try {
			// Get the gnodev flags from the configuration.
			const config = vscode.workspace.getConfiguration('gno');
			const gnodevFlags: string[] = config.get('gnodevFlags', []);

			// Get the path to the gnodev binary.
			const gnodevBinPath = getBinPath('gnodev');

			// Get the workspace folder to run the gnodev process in.
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				throw new Error('No workspace folder found, please open one.');
			}

			// Spawn the gnodev process with the specified flags and in the workspace folder.
			this._process = spawn(gnodevBinPath, gnodevFlags, {
				cwd: workspaceFolder.uri.fsPath,
				stdio: ['pipe', 'pipe', 'pipe']
			});

			// Listen for data on process stdout.
			this._process.stdout?.on('data', (data: Buffer) => {
				const output = data.toString();

				// Forward process stdout to the output channel.
				outputChannel.appendLine(output);

				// Check if the output contains the expected message indicating the process has started.
				const regex = /gnoweb started lisn=http:\/\/([^:]+):(\d+)/;
				const match = output.match(regex);

				if (match) {
					// Extract the host and port from the output.
					const host = match[1];
					const port = parseInt(match[2], 10);

					// Emit the ready event with the address of the gnodev process.
					this._onProcessReady.fire(new GnodevAddress(host, port));
				}
			});

			// Forward process stderr to the output channel.
			this._process.stderr?.on('data', (data: Buffer) => {
				outputChannel.error(data.toString());
			});

			// Fire an error event if the process fails to start.
			this._process.on('error', (error) => {
				this._onProcessExit.fire(new Error(`Failed to start gnodev: ${error.message}`));
			});

			// Handle process exit event.
			this._process.on('exit', (code, signal) => {
				const exitStatus = `Gnodev process exited with code ${code}, signal ${signal}`;

				outputChannel.info(exitStatus);

				// Fire the exit event with an error if any.
				this._onProcessExit.fire(code !== 0 ? new Error(exitStatus) : undefined);
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Error starting gnodev: ${errorMessage}`);
		}
	}

	public stop(): void {
		if (this.isRunning) {
			outputChannel.info('Stopping gnodev process...');
			this._process!.kill();
		}

		this._process = undefined;
	}

	public dispose(): void {
		this.stop();
		this._onProcessReady.dispose();
		this._onProcessExit.dispose();
	}
}
