import * as vscode from 'vscode';
import * as readline from 'readline';
import { spawn, ChildProcess } from 'child_process';
import { getBinPath } from '../util';
import { GnodevAddress } from './address';
import { outputChannel, defaultGroup, parseGnodevLog } from './logs';

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

		outputChannel.info(defaultGroup, 'starting gnodev process...');

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

			// Force gnodev log format to JSON for better parsing.
			gnodevFlags.push('-log-format', 'json');

			// Spawn the gnodev process with the specified flags and in the workspace folder.
			this._process = spawn(gnodevBinPath, gnodevFlags, {
				cwd: workspaceFolder.uri.fsPath,
				stdio: ['pipe', 'pipe', 'pipe']
			});

			// Listen for lines on process stdout.
			const stdout = readline.createInterface({ input: this._process.stdout! });
			stdout.on('line', (line: string) => {
				try {
					// Parse the log line and log it to the output channel.
					const log = parseGnodevLog(line);
					outputChannel.log(log);

					// Check if the output contains th message indicating the process has started.
					if (log.msg === 'gnoweb started') {
						const regex = /http:\/\/([^:]+):(\d+)/;
						const match = (log.args!['lisn'] as string).match(regex);

						if (match) {
							// Extract the host and port from the output.
							const host = match[1];
							const port = parseInt(match[2], 10);

							// Emit the ready event with the address of the gnodev process.
							this._onProcessReady.fire(new GnodevAddress(host, port));
						}
					}
				} catch (error) {
					outputChannel.error(defaultGroup, `Failed to parse gnodev log line: ${line}`);
				}
			});

			// Forward process stderr to the output channel.
			const stderr = readline.createInterface({ input: this._process.stderr! });
			stderr.on('line', (line: string) => {
				outputChannel.error(defaultGroup, `gnodev stderr: ${line}`);
			});

			// Fire an error event if the process fails to start.
			this._process.on('error', (error) => {
				this._onProcessExit.fire(new Error(`Failed to start gnodev: ${error.message}`));
			});

			// Handle process exit event.
			this._process.on('exit', (code, signal) => {
				const exitStatus = `gnodev process exited with code ${code}, signal ${signal}`;

				outputChannel.info(defaultGroup, exitStatus);

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
			outputChannel.info(defaultGroup, 'stopping gnodev process...');
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
