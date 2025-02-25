// <!-- Everything below this line is generated. DO NOT EDIT. -->

import moment = require('moment');
import semver = require('semver');
import { Tool } from './gnoTools';

export const allToolsInformation: { [key: string]: Tool } = {
	'gofumpt': {
		name: 'gofumpt',
		importPath: 'mvdan.cc/gofumpt',
		modulePath: 'mvdan.cc/gofumpt',
		replacedByGopls: true,
		isImportant: false,
		description: 'Formatter',
		defaultVersion: 'v0.7.0'
	},
	'tlin': {
		name: 'tlin',
		importPath: 'github.com/gnolang/tlin/cmd/tlin',
		modulePath: 'github.com/gnolang/tlin/cmd/tlin',
		replacedByGopls: false,
		isImportant: true,
		description: 'Linter',
		defaultVersion: 'v1.1.0'
	},
	'gnopls': {
		name: 'gnopls',
		importPath: 'github.com/gnoverse/gnopls',
		modulePath: 'github.com/gnoverse/gnopls',
		replacedByGopls: false, // lol
		isImportant: true,
		description: 'Language Server from gnolang',
		usePrereleaseInPreviewMode: true,
		latestVersion: semver.parse('%s'),
		latestVersionTimestamp: moment('%s', 'YYYY-MM-DD'),
		latestPrereleaseVersion: semver.parse('%s'),
		latestPrereleaseVersionTimestamp: moment('%s', 'YYYY-MM-DD')
	}
};
