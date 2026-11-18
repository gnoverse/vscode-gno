import * as assert from 'assert';
import * as vscode from 'vscode';
import { buildLanguageClient } from '../../src/language/gnoLanguageServer';

suite('package link middleware', () => {
	test('rewrites document links and hover markdown', async () => {
		const client = await buildLanguageClient(
			{},
			{
				serverName: 'gnopls',
				path: '',
				version: { version: '(devel)', goVersion: '' },
				enabled: false,
				flags: [],
				env: {},
				features: {},
				checkForUpdates: 'off'
			}
		);
		try {
			const middleware = client.clientOptions.middleware!;
			const document = await vscode.workspace.openTextDocument({ language: 'gno', content: 'package demo' });
			const token = new vscode.CancellationTokenSource();
			try {
				const range = new vscode.Range(0, 0, 0, 1);
				const link = new vscode.DocumentLink(range, vscode.Uri.parse('https://gno.land/gno.land/r/demo/foo'));
				const links = await middleware.provideDocumentLinks!(document, token.token, () => [link]);
				assert.strictEqual(links![0].target!.toString(), 'http://127.0.0.1:8888/r/demo/foo%24source');
				const source = new vscode.DocumentLink(
					range,
					vscode.Uri.parse('https://pkg.go.dev/gno.land/r/demo/foo$source')
				);
				const sourceLinks = await middleware.provideDocumentLinks!(document, token.token, () => [source]);
				assert.strictEqual(sourceLinks![0].target!.toString(), 'http://127.0.0.1:8888/r/demo/foo%24source');
				const file = new vscode.DocumentLink(
					range,
					vscode.Uri.parse('https://gno.land/r/demo/foo$source&file=main.gno')
				);
				const originalTarget = file.target!.toString();
				const fileLinks = await middleware.provideDocumentLinks!(document, token.token, () => [file]);
				assert.strictEqual(fileLinks![0].target!.toString(), originalTarget);
				const content = new vscode.MarkdownString('[foo](https://gno.land/gno.land/r/demo/foo#Bar)');
				content.isTrusted = false;
				const hover = new vscode.Hover(content, range);
				const result = await middleware.provideHover!(document, range.start, token.token, () => hover);
				assert.strictEqual(
					(result!.contents[0] as vscode.MarkdownString).value,
					'[foo](http://127.0.0.1:8888/r/demo/foo$source#Bar)'
				);
				assert.strictEqual((result!.contents[0] as vscode.MarkdownString).isTrusted, false);
				assert.strictEqual(result!.range, range);
			} finally {
				token.dispose();
			}
		} finally {
			await client.dispose();
		}
	});
});
