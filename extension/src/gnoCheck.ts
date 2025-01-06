/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import path = require('path');
import vscode = require('vscode');
import { getGnoplsConfig } from './config';
import { goLint } from './gnoLint';
import { isModSupported } from './gnoModules';
import { diagnosticsStatusBarItem, outputChannel } from './gnoStatus';
import { getTestFlags, goTest, TestConfig } from './testUtils';
import { ICheckResult } from './util';
import { GoExtensionContext } from './context';

const STATUS_BAR_ITEM_NAME = 'Gno Test';
const statusBarItem = vscode.window.createStatusBarItem(STATUS_BAR_ITEM_NAME, vscode.StatusBarAlignment.Left);
statusBarItem.name = STATUS_BAR_ITEM_NAME;
statusBarItem.command = 'gno.test.showOutput';
const neverAgain = { title: "Don't Show Again" };

export function removeTestStatus(e: vscode.TextDocumentChangeEvent) {
	if (e.document.isUntitled) {
		return;
	}
	statusBarItem.hide();
	statusBarItem.text = '';
}

export function notifyIfGeneratedFile(this: void, e: vscode.TextDocumentChangeEvent) {
	const ctx: any = this;
	if (e.document.isUntitled || e.document.languageId !== 'gno') {
		return;
	}
	if (
		ctx.globalState.get('ignoreGeneratedCodeWarning') !== true &&
		e.document.lineAt(0).text.match(/^\/\/ Code generated .* DO NOT EDIT\.$/)
	) {
		vscode.window.showWarningMessage('This file seems to be generated. DO NOT EDIT.', neverAgain).then((result) => {
			if (result === neverAgain) {
				ctx.globalState.update('ignoreGeneratedCodeWarning', true);
			}
		});
	}
}

interface IToolCheckResults {
	diagnosticCollection: vscode.DiagnosticCollection;
	errors: ICheckResult[];
}

export function check(
	goCtx: GoExtensionContext,
	fileUri: vscode.Uri,
	goConfig: vscode.WorkspaceConfiguration
): Promise<IToolCheckResults[]> {
	diagnosticsStatusBarItem.hide();
	outputChannel.appendLine('Running checks...');
	const runningToolsPromises = [];
	const cwd = path.dirname(fileUri.fsPath);

	const { lintDiagnosticCollection } = goCtx;

	let testPromise: Thenable<boolean>;
	const testConfig: TestConfig = {
		goConfig,
		dir: cwd,
		flags: getTestFlags(goConfig),
		background: true
	};

	const runTest = () => {
		if (testPromise) {
			return testPromise;
		}

		testPromise = isModSupported(fileUri).then((isMod) => {
			return goTest(testConfig);
		});
		return testPromise;
	};

	if (goConfig['testOnSave']) {
		statusBarItem.show();
		statusBarItem.text = 'Tests Running';
		runTest().then((success) => {
			if (statusBarItem.text === '') {
				return;
			}
			if (success) {
				statusBarItem.text = 'Tests Passed';
			} else {
				statusBarItem.text = 'Tests Failed';
			}
		});
	}

	if (lintDiagnosticCollection && !!goConfig['lintOnSave'] && goConfig['lintOnSave'] !== 'off') {
		const goplsConfig = getGnoplsConfig(fileUri);
		runningToolsPromises.push(
			goLint(fileUri, goConfig, goplsConfig, goConfig['lintOnSave']).then((errors) => ({
				diagnosticCollection: lintDiagnosticCollection,
				errors
			}))
		);
	}

	if (goConfig['coverOnSave']) {
		runTest().then((success) => {
			if (!success) {
				return [];
			}
		});
	}

	return Promise.all(runningToolsPromises);
}
