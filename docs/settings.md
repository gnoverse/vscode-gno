# Settings

This extension is highly configurable, and as such, offers a number of settings. These can be configured by modifying your [User or Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings).

To navigate to your settings, open the Command Palette (`Ctrl+Shift+P` on Linux/Windows and `Cmd+Shift+P` on macOS) and search for "settings". The simplest way to modify your settings is through "Preferences: Open Settings (UI)".

To tune the features provided by `gnopls`, see the [`gnopls`](#gnopls) setting.

To view the list of settings:

1. Navigate to the Extensions view (`Ctrl+Shift+X` on Linux/Windows or `Cmd+Shift+X` on macOS).
2. Find the Gno extension and click on it to open the Extension Editor.
3. Click on the `Feature Contributions` tab.
4. Scroll through the list under `Settings`.

## Detailed list

<!-- Everything below this line is generated. DO NOT EDIT. -->

### `gno.alternateTools`

Alternate tools or alternate paths for the tools used by the Gno extension. Provide either an absolute path or the name of the binary in GOPATH/bin, GOROOT/bin or PATH. Useful when you want to use a wrapper script for the Gno tools.

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
map[addImport:true addPackage:true fillStruct:false realm:true testAtCursor:true testFile:false]
```

### `gno.enableCodeLens`

Enable or disable code lens for running tests, previewing realm Render output, and calling realm functions

Default:
```
map[call:true render:true runtest:true]
```

### `gno.formatTool`

Formatter to use. When the language server is enabled, it handles formatting for both options.<br/>
Allowed Options:

* `default`: Formats the file according to the standard Gno style.
* `gofumpt`: Formats the file with [gofumpt](https://github.com/mvdan/gofumpt).


Default: `"default"`

### `gno.gnodev.displayButton`

Show the gnodev start/stop button in the editor title bar of Gno files.

Default: `true`

### `gno.gnodev.flags`

Flags to pass to gnodev (e.g. ["-paths", "gno.land/r/demo/foo"]). `-log-format json` is always added.

### `gno.gnodev.openBrowser`

Controls how gnoweb opens when gnodev starts.<br/>
Allowed Options:

* `none`: Do not open gnoweb
* `current`: Open gnoweb in the active editor group
* `beside`: Open gnoweb beside the active editor group
* `external`: Open gnoweb in the external browser


Default: `"beside"`

### `gno.gopath`

Specify GOPATH here to override the one that is set as environment variable. The inferred GOPATH from workspace root overrides this, if `gno.inferGopath` is set to true.

### `gno.goroot`

Specifies the GOROOT to use when no environment variable is set.

### `gno.inferGopath`

Infer GOPATH from the workspace root. This is ignored when using Gno modules.

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

### `gno.network`

Name of the network in `#gno.networks#` used by chain commands such as **Gno: Add Package To Chain**. The default `local` network is the node started by gnodev.

Default: `"local"`

### `gno.networks`

Networks that Gno transactions and queries are sent to, by name. The default `local` network is the node started by gnodev, and can be changed by defining `local` here. Select a network with `#gno.network#` or the **Gno: Select Network** command. Set each network’s `gnoweb` base URL for package source links; it falls back to https://gno.land when omitted.

Default:
```
map[local:map[chainId:dev gnoweb:http://127.0.0.1:8888 remote:127.0.0.1:26657]]
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

Flags to pass to `gno test`. This is not propagated to the language server.

### `gno.testOnSave`

Run `gno test` on save for the current package. It is not advised to set this to `true` when you have Auto Save enabled.

Default: `false`

### `gno.testTimeout`

Specifies the timeout for `gno test` in Go duration format, such as `30s`.

Default: `"30s"`

### `gno.toolsGopath`

Location to install the Gno tools that the extension depends on if you don't want them in your GOPATH.

### `gno.toolsManagement.checkForUpdates`

Specify whether to prompt about new versions of Gno and the Gno tools (currently, only `gnopls`) the extension depends on<br/>
Allowed Options:

* `local`: checks only the minimum tools versions required by the extension
* `off`: completely disables version check (not recommended)


Default: `"local"`

### `gno.toolsManagement.go`

The path to the `go` binary used to install Gno tools such as `gnopls` with `go install`. If empty, the `go` binary chosen for the project is used.

Default: `""`

### `gno.trace.server`

Trace the communication between VS Code and the Gno language server.<br/>
Allowed Options: `off`, `messages`, `verbose`

Default: `"off"`

### `gno.useLanguageServer`

Enable intellisense, code navigation, refactoring, formatting & diagnostics for Gno. The features are powered by the Gno language server "gnopls".

Default: `true`

### `gnopls`

Configure the Gno language server ('gnopls'). In most cases, configuring this section is unnecessary. See [the documentation](https://github.com/gnoverse/gnopls) for all available settings.


