# Settings

This extension is highly configurable, and as such, offers a number of settings. These can be configured by modifying your [User or Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings).

To navigate to your settings, open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P) and search for "settings". The simplest way to modify your settings is through "Preferences: Open Settings (UI)".

For tuning the features provided by `gnopls`, see the [section](settings.md#settings-for-gnopls) for `gnopls` settings.

To view the list of settings:

1. Navigate to the Extensions view (Ctrl+Shift+X).
2. Find the Gno extension and click on it to open the Extension Editor.
3. Click on the `Feature Contributions` tab.
4. Scroll through the list under `Settings`.

## Detailed list

<!-- Everything below this line is generated. DO NOT EDIT. -->

### `gno.alternateTools`

Alternate tools or alternate paths for the same tools used by the Go extension. Provide either absolute path or the name of the binary in GOPATH/bin, GOROOT/bin or PATH. Useful when you want to use wrapper script for the Go tools.

Default:
```
map[]
```

### `gno.disableConcurrentTests`

If true, tests will not run concurrently. When a new test run is started, the previous will be cancelled.

Default: `false`

### `gno.editorContextMenuCommands`

Experimental Feature: Enable/Disable entries from the context menu in the editor.

Default:
```
map[addImport:true fillStruct:false testAtCursor:true testFile:false]
```

### `gno.editorContextMenuCommands.addPackage`

If true, adds command to add package to the Gno blockchain to the editor context menu

Default: `true`

### `gno.enableCodeLens`

Feature level setting to enable/disable code lens for references and run/debug tests

Default:
```
map[runtest:true]
```

### `gno.formatTool`

When the language server is enabled and one of `default`/`gofumpt` is chosen, the language server will handle formatting. If `custom` tool is selected, the extension will use the `customFormatter` tool in the `#go.alternateTools#` section.<br/>
Allowed Options: `default`, `gofumpt`

Default: `"default"`

### `gno.gopath`

Specify GOPATH here to override the one that is set as environment variable. The inferred GOPATH from workspace root overrides this, if go.inferGopath is set to true.

### `gno.goroot`

Specifies the GOROOT to use when no environment variable is set.

### `gno.inferGopath`

Infer GOPATH from the workspace root. This is ignored when using Go Modules.

Default: `false`

### `gno.languageServerFlags`

Flags like -rpc.trace and -logfile to be used while running the language server.

### `gno.lintFlags`

Flags to pass to Lint tool (e.g. ["-min_confidence=.8"])

### `gno.lintOnSave`

Lints code on file save using the configured Lint tool. Options are 'file', 'package', 'workspace' or 'off'.<br/>
Allowed Options:

* `file`: lint the current file on file saving
* `package`: lint the current package on file saving
* `workspace`: lint all the packages in the current workspace root folder on file saving
* `off`: do not run lint automatically


Default: `"package"`

### `gno.lintTool`

Specifies Lint tool name.<br/>
Allowed Options: `staticcheck`, `golint`, `golangci-lint`, `revive`

Default: `"staticcheck"`

### `gno.makeTx`

Configuration for Gno blockchain transactions

Default:
```
map[broadcast:true gasFee:1000000ugnot gasWanted:4000000]
```

### `gno.showWelcome`

Specifies whether to show the Welcome experience on first install

Default: `true`

### `gno.terminal.activateEnvironment`

Apply the Gno & PATH environment variables used by the extension to all integrated terminals.

Default: `true`

### `gno.testExplorer.concatenateMessages`

Concatenate all test log messages for a given location into a single message.

Default: `true`

### `gno.testExplorer.enable`

Enable the Gno test explorer

Default: `true`

### `gno.testExplorer.packageDisplayMode`

Present packages in the test explorer flat or nested.<br/>
Allowed Options: `flat`, `nested`

Default: `"flat"`

### `gno.testExplorer.showOutput`

Open the test output terminal when a test run is started.

Default: `true`

### `gno.testFlags`

Flags to pass to `gno test`. If null, then buildFlags will be used. This is not propagated to the language server.

### `gno.testOnSave`

Run 'go test' on save for current package. It is not advised to set this to `true` when you have Auto Save enabled.

Default: `false`

### `gno.testTimeout`

Specifies the timeout for go test in ParseDuration format.

Default: `"30s"`

### `gno.toolsGopath`

Location to install the Go tools that the extension depends on if you don't want them in your GOPATH.

### `gno.toolsManagement.checkForUpdates`

Specify whether to prompt about new versions of Gno and the Gno tools (currently, only `gnopls`) the extension depends on<br/>
Allowed Options:

* `local`: checks only the minimum tools versions required by the extension
* `off`: completely disables version check (not recommended)


Default: `"local"`

### `gno.toolsManagement.go`

The path to the `go` binary used to install the Gno tools. If it's empty, the same `go` binary chosen for the project will be used for tool installation.

Default: `""`

### `gno.trace.server`

Trace the communication between VS Code and the Gno language server.<br/>
Allowed Options: `off`, `messages`, `verbose`

Default: `"off"`

### `gno.useLanguageServer`

Enable intellisense, code navigation, refactoring, formatting & diagnostics for Gno. The features are powered by the Go language server "gopls".

Default: `true`

### `gnopls`

Configure the default Go language server ('gnopls'). In most cases, configuring this section is unnecessary. See [the documentation](https://github.com/gnoverse/gnopls) for all available settings.


