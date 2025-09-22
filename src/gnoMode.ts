/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');

interface Filter extends vscode.DocumentFilter {
	language: string;
	scheme: string;
}

export const GO_MODE: Filter = { language: 'gno', scheme: 'file' };

export function isGoFile(document: vscode.TextDocument): boolean {
	return GoDocumentSelector.some((selector) => vscode.languages.match(selector, document));
}

export const GoDocumentSelector = [
	// gopls handles only file URIs.
	{ language: 'gno', scheme: 'file' },
	{ language: 'gno.mod', scheme: 'file' },
	{ language: 'gno.sum', scheme: 'file' },
	{ language: 'gno.work', scheme: 'file' },
	{ language: 'gnotmpl', scheme: 'file' }
];
