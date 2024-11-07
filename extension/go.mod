module github.com/gnolang/vscode-gno/extension

go 1.22.5

toolchain go1.21.9

// For development, use the vscgo in the same repo.
// This go.mod file is excluded when packaging .vsix.
replace github.com/golang/vscode-go => ../
