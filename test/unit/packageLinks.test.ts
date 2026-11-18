import * as assert from 'assert';
import { packageSourceLink, packageSourceLinksInMarkdown } from '../../src/language/packageLinks';

suite('package source links', () => {
	test('maps gnopls package URLs to the selected gnoweb', () => {
		for (const link of [
			'https://gno.land/gno.land/r/gnoland/coins',
			'https://pkg.go.dev/gno.land/r/gnoland/coins',
			'https://godoc.org/gno.land/r/gnoland/coins'
		]) {
			assert.strictEqual(
				packageSourceLink(link, 'http://127.0.0.1:8888/'),
				'http://127.0.0.1:8888/r/gnoland/coins$source'
			);
		}
		assert.strictEqual(
			packageSourceLink(
				'https://docs.example/gno.land/p/demo/avl#Tree',
				'https://test.example/gno/',
				'docs.example'
			),
			'https://test.example/gno/p/demo/avl$source#Tree'
		);
	});

	test('falls back to gno.land and does not duplicate the source suffix', () => {
		assert.strictEqual(
			packageSourceLink('https://pkg.go.dev/gno.land/p/demo/avl$source#Tree'),
			'https://gno.land/p/demo/avl$source#Tree'
		);
		assert.strictEqual(
			packageSourceLink('https://pkg.go.dev/gno.land/p/demo/avl%24source#Tree'),
			'https://gno.land/p/demo/avl$source#Tree'
		);
		assert.strictEqual(
			packageSourceLink('https://pkg.go.dev/gno.land/r/gnoland/coins'),
			'https://gno.land/r/gnoland/coins$source'
		);
	});

	test('leaves unrelated links and invalid URLs alone', () => {
		for (const link of [
			'https://gno.land/std',
			'https://gno.land/r/gnoland/blog',
			'https://gno.land/r/demo/foo$source',
			'https://pkg.go.dev/fmt#Println',
			'https://pkg.go.dev/r/demo/foo',
			'https://example.com/gno.land/r/demo/foo',
			'https://gno.land.example/r/demo/foo',
			'https://pkg.go.dev/gno.land/r/demo/foo:p/about',
			'https://pkg.go.dev/gno.land/r/demo/foo$source&file=render.gno',
			'https://pkg.go.dev/gno.land/r/demo/foo%24source&file=render.gno',
			'file:///gno.land/r/demo/foo',
			'not a URL'
		]) {
			assert.strictEqual(packageSourceLink(link), link);
		}
		const link = 'https://pkg.go.dev/gno.land/r/demo/foo';
		assert.strictEqual(packageSourceLink(link, 'not a URL'), link);
		assert.strictEqual(packageSourceLink(link, 'javascript:alert(1)'), link);
	});

	test('rewrites hover destinations while preserving labels and other documentation', () => {
		const markdown = [
			'[coins](https://pkg.go.dev/gno.land/r/gnoland/coins#Balance)',
			'<https://pkg.go.dev/gno.land/p/demo/avl>',
			'[blog](https://gno.land/r/gnoland/blog)',
			'[fmt](https://pkg.go.dev/fmt)',
			'`https://gno.land/r/demo/foo`'
		].join('\n');
		assert.strictEqual(
			packageSourceLinksInMarkdown(markdown, 'http://localhost:8888'),
			[
				'[coins](http://localhost:8888/r/gnoland/coins$source#Balance)',
				'<http://localhost:8888/p/demo/avl$source>',
				'[blog](https://gno.land/r/gnoland/blog)',
				'[fmt](https://pkg.go.dev/fmt)',
				'`https://gno.land/r/demo/foo`'
			].join('\n')
		);
	});
});
