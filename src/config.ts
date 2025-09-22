/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import vscode = require('vscode');
import semver = require('semver');
import { extensionId } from './const';

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
export class ExtensionInfo {
	/** Extension version */
	readonly version?: string;
	/** The application name of the editor, like 'VS Code' */
	readonly appName: string;
	/** True if the extension runs in preview mode (e.g. Nightly, prerelease) */
	readonly isPreview: boolean;
	/** True if the extension runs in well-kwnon cloud IDEs */
	readonly isInCloudIDE: boolean;

	constructor() {
		const packageJSON = vscode.extensions.getExtension(extensionId)?.packageJSON;
		const version = semver.parse(packageJSON?.version);
		this.version = version?.format();
		this.appName = vscode.env.appName;

		// gnolang.gno prerelease: minor version is an odd number, or has the "-dev" suffix.
		this.isPreview =
			extensionId === 'gnolang.gno' && !!version
				? version.minor % 2 === 1 || version.toString().endsWith('-dev')
				: false;
		this.isInCloudIDE =
			process.env.CLOUD_SHELL === 'true' ||
			process.env.MONOSPACE_ENV === 'true' ||
			process.env.CODESPACES === 'true' ||
			!!process.env.GITPOD_WORKSPACE_ID;
	}
}

export const extensionInfo = new ExtensionInfo();
