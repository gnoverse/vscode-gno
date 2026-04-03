import * as assert from 'assert';
import { stopLanguageClient } from '../../src/language/gnoLanguageServer';
import { GoExtensionContext } from '../../src/context';

suite('stopLanguageClient', () => {
	test('should await client.stop before returning (regression: command already exists)', async () => {
		// Track the order of operations to verify that stopLanguageClient
		// awaits the stop() promise. Before the fix, stop() was called
		// without await, so the function would return before the client
		// finished disposing its registered commands — causing
		// "command 'gnopls.add_dependency' already exists" on restart.
		const events: string[] = [];

		const fakeClient = {
			diagnostics: {
				clear() {
					events.push('diagnostics.clear');
				}
			},
			outputChannel: {
				appendLine(_msg: string) {}
			},
			stop(timeout?: number) {
				assert.strictEqual(timeout, 2000);
				return new Promise<void>((resolve) => {
					// Simulate async disposal that takes some time
					setTimeout(() => {
						events.push('client.stopped');
						resolve();
					}, 50);
				});
			}
		};

		const goCtx = {
			languageClient: fakeClient,
			crashCount: 3
		} as unknown as GoExtensionContext;

		await stopLanguageClient(goCtx);

		// After stopLanguageClient returns, the client must have fully stopped.
		// If stop() were not awaited, 'client.stopped' would be missing here.
		assert.ok(
			events.includes('client.stopped'),
			`Expected client.stop() to be awaited, but got events: [${events.join(', ')}]`
		);
		assert.strictEqual(goCtx.crashCount, 0);
		assert.strictEqual(goCtx.languageClient, undefined);
	});

	test('should handle stop() rejection gracefully', async () => {
		const fakeClient = {
			diagnostics: null,
			outputChannel: {
				appendLine(_msg: string) {}
			},
			stop() {
				return Promise.reject(new Error('server crashed'));
			}
		};

		const goCtx = {
			languageClient: fakeClient,
			crashCount: 1
		} as unknown as GoExtensionContext;

		// Should not throw
		await stopLanguageClient(goCtx);

		assert.strictEqual(goCtx.crashCount, 0);
		assert.strictEqual(goCtx.languageClient, undefined);
	});

	test('should return early when no client exists', async () => {
		const goCtx = {
			languageClient: undefined,
			crashCount: 0
		} as unknown as GoExtensionContext;

		const result = await stopLanguageClient(goCtx);
		assert.strictEqual(result, false);
	});
});
