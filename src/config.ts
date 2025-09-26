/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import vscode = require('vscode');
import semver = require('semver');

/** getGnoConfig is declared as an exported const rather than a function, so it can be stubbbed in testing. */
export const getGnoConfig = (uri?: vscode.Uri) => {
	return getConfig('gno', uri);
};

/** getGnoplsConfig returns the user's gopls configuration. */
export function getGnoplsConfig(uri?: vscode.Uri) {
	return getConfig('gnopls', uri);
}

function getConfig(section: string, uri?: vscode.Uri | null) {
	if (!uri) {
		if (vscode.window.activeTextEditor) {
			uri = vscode.window.activeTextEditor.document.uri;
		} else {
			uri = null;
		}
	}
	return vscode.workspace.getConfiguration(section, uri);
}

/** ExtensionInfo is a collection of static information about the extension. */
class ExtensionInfo {
	/** Extension version */
	readonly version?: string;
	/** The extension ID */
	readonly extensionId: string;
	/** The extension package.json */
	readonly packageJSON: any;
	/** The application name of the editor, like 'VS Code' */
	readonly appName: string;
	/** True if the extension runs in well-known cloud IDEs */
	readonly isInCloudIDE: boolean;

	constructor(ctx: Pick<vscode.ExtensionContext, 'extension'>) {
		this.extensionId = ctx.extension.id;
		this.packageJSON = ctx.extension.packageJSON;
		this.version = semver.parse(this.packageJSON.version)?.format();
		this.appName = vscode.env.appName;

		this.isInCloudIDE =
			process.env.CLOUD_SHELL === 'true' ||
			process.env.MONOSPACE_ENV === 'true' ||
			process.env.CODESPACES === 'true' ||
			!!process.env.GITPOD_WORKSPACE_ID;
	}
}

// Global singleton instance of the extension info.
let extensionInfo: ExtensionInfo;

// Singleton accessor for the extension info.
export function getExtensionInfo() {
	return extensionInfo;
}

// Initialize the global extension info instance.
export function initExtensionInfo(ctx: Pick<vscode.ExtensionContext, 'extension'>) {
	extensionInfo = new ExtensionInfo(ctx);
}