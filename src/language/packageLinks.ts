/** Maps gnopls documentation URLs for on-chain packages to gnoweb source pages. */
export function packageSourceLink(link: string, gnoweb = 'https://gno.land', linkTarget = 'pkg.go.dev'): string {
	try {
		const url = new URL(link);
		if (!['http:', 'https:'].includes(url.protocol)) return link;
		if (
			!url.pathname.startsWith('/gno.land/') ||
			![linkTarget, 'gno.land', 'pkg.go.dev', 'godoc.org'].includes(url.host)
		) {
			return link;
		}
		const packagePath = url.pathname.slice('/gno.land'.length).replace(/(?:\$|%24)source$/, '');
		if (!/^\/[rp]\/[\w.-]+\/[\w./-]+$/.test(packagePath)) return link;
		const base = new URL(gnoweb);
		if (!['http:', 'https:'].includes(base.protocol)) return link;
		return `${base.href.replace(/\/$/, '')}${packagePath}$source${url.hash}`;
	} catch {
		return link;
	}
}

export function packageSourceLinksInMarkdown(markdown: string, gnoweb?: string, linkTarget?: string): string {
	return markdown.replace(/(\]\(\s*|<)(https?:\/\/[^\s<>)]+)/g, (_, prefix: string, link: string) => {
		return prefix + packageSourceLink(link, gnoweb, linkTarget);
	});
}
