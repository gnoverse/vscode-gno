/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { CancellationToken, CodeLens, TextDocument } from 'vscode';
import { getGnoConfig } from './config';
import { GoBaseCodeLensProvider } from './gnoBaseCodelens';
import { GoDocumentSymbolProvider } from './gnoDocumentSymbols';
import { getTestFunctions } from './testUtils';
import { GoExtensionContext } from './context';
import { GO_MODE } from './gnoMode';

export class GoRunTestCodeLensProvider extends GoBaseCodeLensProvider {
	static activate(ctx: vscode.ExtensionContext, goCtx: GoExtensionContext) {
		const testCodeLensProvider = new this(goCtx);
		ctx.subscriptions.push(vscode.languages.registerCodeLensProvider(GO_MODE, testCodeLensProvider));
		ctx.subscriptions.push(
			vscode.workspace.onDidChangeConfiguration(async (e: vscode.ConfigurationChangeEvent) => {
				if (!e.affectsConfiguration('gno')) {
					return;
				}
				const updatedGoConfig = getGnoConfig();
				if (updatedGoConfig['enableCodeLens']) {
					testCodeLensProvider.setEnabled(updatedGoConfig['enableCodeLens']['runtest']);
				}
			})
		);
	}

	constructor(private readonly goCtx: GoExtensionContext) {
		super();
	}

	public async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		if (!this.enabled) {
			return [];
		}
		const config = getGnoConfig(document.uri);
		const codeLensConfig = config.get<{ [key: string]: any }>('enableCodeLens');
		const codelensEnabled = codeLensConfig ? codeLensConfig['runtest'] : false;
		if (!codelensEnabled || !document.fileName.endsWith('_test.gno')) {
			return [];
		}

		const codelenses = await Promise.all([
			this.getCodeLensForPackage(document, token),
			this.getCodeLensForFunctions(document, token)
		]);
		return ([] as CodeLens[]).concat(...codelenses);
	}

	private async getCodeLensForPackage(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		const documentSymbolProvider = GoDocumentSymbolProvider(this.goCtx);
		const symbols = await documentSymbolProvider.provideDocumentSymbols(document);
		if (!symbols || symbols.length === 0) {
			return [];
		}
		const pkg = symbols[0];
		if (!pkg) {
			return [];
		}
		const range = pkg.range;
		const packageCodeLens = [
			new CodeLens(range, {
				title: 'run package tests',
				command: 'gno.test.package'
			}),
			new CodeLens(range, {
				title: 'run file tests',
				command: 'gno.test.file'
			})
		];

		return packageCodeLens;
	}

	private async getCodeLensForFunctions(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		const testPromise = async (): Promise<CodeLens[]> => {
			const codelens: CodeLens[] = [];

			const testFunctions = await getTestFunctions(this.goCtx, document, token);
			if (!testFunctions) {
				return codelens;
			}

			const simpleRunRegex = /t.Run\("([^"]+)",/;

			for (const f of testFunctions) {
				const functionName = f.name;

				codelens.push(
					new CodeLens(f.range, {
						title: 'run test',
						command: 'gno.test.cursor',
						arguments: [{ functionName }]
					}),
					new CodeLens(f.range, {
						title: 'debug test',
						command: 'gno.debug.cursor',
						arguments: [{ functionName }]
					})
				);

				for (let i = f.range.start.line; i < f.range.end.line; i++) {
					const line = document.lineAt(i);
					const simpleMatch = line.text.match(simpleRunRegex);

					// BUG: this does not handle nested subtests. This should
					// be solved once codelens is handled by gopls and not by
					// vscode.
					if (simpleMatch) {
						const subTestName = simpleMatch[1];

						codelens.push(
							new CodeLens(line.range, {
								title: 'run test',
								command: 'gno.subtest.cursor',
								arguments: [{ functionName, subTestName }]
							}),
							new CodeLens(line.range, {
								title: 'debug test',
								command: 'gno.debug.subtest.cursor',
								arguments: [{ functionName, subTestName }]
							})
						);
					}
				}
			}

			return codelens;
		};

		const codelenses = await Promise.all([testPromise()]);
		return ([] as CodeLens[]).concat(...codelenses);
	}
}
