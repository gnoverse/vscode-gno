import * as vscode from 'vscode';

type JSONValue = string | number | boolean | null | JSONValue[] | JSONKeyValue;

type JSONKeyValue = {
	[key: string]: JSONValue;
};

enum Level {
	Debug = 'debug',
	Info = 'info',
	Warn = 'warn',
	Error = 'error'
}

interface GnodevLog {
	level: Level;
	group: string | undefined;
	msg: string | undefined;
	args: JSONKeyValue | undefined;
}

// Parse a JSON line from gnodev logs and return a structured GnodevLog object.
export const parseGnodevLog = (line: string): GnodevLog => {
	// Destructure to extract known fields and the rest
	const { level, ts, msg, ...rest } = JSON.parse(line); // eslint-disable-line

	// Identify the 'group' and 'args' by extracting the first key-value pair in 'rest'
	const group = Object.keys(rest)[0];
	const args = rest[group];

	// Return the formatted Log object
	return {
		level,
		group,
		msg,
		args
	};
};

export class GnodevOutputChannel {
	public readonly outputChannel: vscode.LogOutputChannel;

	constructor() {
		this.outputChannel = vscode.window.createOutputChannel('Gnodev', {
			log: true
		});
	}

	public log(log: GnodevLog): void {
		switch (log.level) {
			case Level.Debug:
				this.debug(log.group, log.msg, log.args || {});
				break;
			case Level.Info:
				this.info(log.group, log.msg, log.args || {});
				break;
			case Level.Warn:
				this.warn(log.group, log.msg, log.args || {});
				break;
			case Level.Error:
				this.error(log.group, log.msg, log.args || {});
				break;
			default:
				throw new Error(`Unknown log level: ${log.level}`);
		}
	}

	private formatMessage(group: string | undefined, message: string | undefined): string {
		let formattedMessage = group ? `[${group}] ` : '';
		formattedMessage += message ? message : '';
		return formattedMessage;
	}

	public debug(group: string | undefined, message: string | undefined, ...args: any[]): void {
		this.outputChannel.debug(this.formatMessage(group, message), ...args);
	}

	public info(group: string | undefined, message: string | undefined, ...args: any[]): void {
		this.outputChannel.info(this.formatMessage(group, message), ...args);
	}

	public warn(group: string | undefined, message: string | undefined, ...args: any[]): void {
		this.outputChannel.warn(this.formatMessage(group, message), ...args);
	}

	public error(group: string | undefined, message: string | undefined, ...args: any[]): void {
		this.outputChannel.error(this.formatMessage(group, message), ...args);
	}
}

export const defaultGroup = 'VSCode';

export const outputChannel = new GnodevOutputChannel();
