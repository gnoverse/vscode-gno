import * as vscode from 'vscode';

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

	public equals(other: GnodevAddress): boolean {
		return this.host === other.host && this.port === other.port;
	}
}
