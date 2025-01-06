// Copyright 2020 The Go Authors. All rights reserved.
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

// To update documentation based on the current package.json:
//
//	go run tools/generate.go

package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

var (
	writeFlag = flag.Bool("w", true, "Write new file contents to disk.")
)

func checkAndWrite(filename string, oldContent, newContent []byte) {
	if bytes.Equal(oldContent, newContent) {
		return
	}

	if *writeFlag {
		if err := os.WriteFile(filename, newContent, 0644); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("updated %s\n", filename)
	} else {
		base := filepath.Join("..", "docs", filepath.Base(filename))
		fmt.Printf(`%s have changed in the package.json, but documentation in %s was not updated.
To update the settings, run "go run tools/generate.go -w".
`, strings.TrimSuffix(base, ".md"), base)
		os.Exit(1)
	}
}

type PackageJSON struct {
	Contributes struct {
		Commands      []Command `json:"commands,omitempty"`
		Configuration struct {
			Properties map[string]*Property `json:"properties,omitempty"`
		} `json:"configuration,omitempty"`
	} `json:"contributes,omitempty"`
}

type Command struct {
	Command     string `json:"command,omitempty"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
}

type Property struct {
	name string `json:"name,omitempty"`

	Properties                 map[string]*Property `json:"properties,omitempty"`
	Default                    interface{}          `json:"default,omitempty"`
	MarkdownDescription        string               `json:"markdownDescription,omitempty"`
	Description                string               `json:"description,omitempty"`
	MarkdownDeprecationMessage string               `json:"markdownDeprecationMessage,omitempty"`
	DeprecationMessage         string               `json:"deprecationMessage,omitempty"`
	Type                       interface{}          `json:"type,omitempty"`
	Enum                       []interface{}        `json:"enum,omitempty"`
	EnumDescriptions           []string             `json:"enumDescriptions,omitempty"`
	MarkdownEnumDescriptions   []string             `json:"markdownEnumDescriptions,omitempty"`
}

func main() {
	flag.Parse()

	dir, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}

	packageJSONFile := filepath.Join(dir, "package.json")
	data, err := os.ReadFile(packageJSONFile)
	if err != nil {
		log.Fatal(err)
	}

	pkgJSON := &PackageJSON{}
	if err := json.Unmarshal(data, pkgJSON); err != nil {
		log.Fatal(err)
	}

	rewrite := func(filename string, toAdd []byte) {
		oldContent, err := os.ReadFile(filename)
		if err != nil {
			log.Fatal(err)
		}
		gen := []byte(`<!-- Everything below this line is generated. DO NOT EDIT. -->`)
		split := bytes.Split(oldContent, gen)
		if len(split) == 1 {
			log.Fatalf("expected to find %q in %s, not found", gen, filename)
		}
		var s []byte
		if strings.HasSuffix(filename, ".ts") {
			s = bytes.Join([][]byte{
				split[0],
				gen,
				[]byte("\n\n"),
				toAdd,
			}, []byte{})
		} else {
			s = bytes.Join([][]byte{
				bytes.TrimSpace(split[0]),
				gen,
				toAdd,
			}, []byte("\n\n"))
		}
		newContent := append(s, '\n')
		checkAndWrite(filename, oldContent, newContent)
	}

	b := &bytes.Buffer{}
	for i, c := range pkgJSON.Contributes.Commands {
		fmt.Fprintf(b, "### `%s`\n\n%s", c.Command, c.Description)
		if i != len(pkgJSON.Contributes.Commands)-1 {
			b.WriteString("\n\n")
		}
	}
	rewrite(filepath.Join(dir, "..", "docs", "commands.md"), b.Bytes())

	b.Reset()
	var properties []*Property
	for name, p := range pkgJSON.Contributes.Configuration.Properties {
		p.name = name
		properties = append(properties, p)
	}

	sort.Slice(properties, func(i, j int) bool {
		return properties[i].name < properties[j].name
	})

	for _, p := range properties {
		writeProperty(b, "###", p)
		b.WriteString("\n\n")
	}

	rewrite(filepath.Join(dir, "..", "docs", "settings.md"), b.Bytes())

	// Generate gnoToolsInformation.ts from template
	allToolsFile := filepath.Join(dir, "tools", "allTools.ts.in")
	toolsData, err := os.ReadFile(allToolsFile)
	if err != nil {
		log.Fatal(err)
	}

	// Write tools section
	rewrite(filepath.Join(dir, "src", "gnoToolsInformation.ts"), toolsData)
}

func writeProperty(b *bytes.Buffer, heading string, p *Property) {
	desc := p.Description
	if p.MarkdownDescription != "" {
		desc = p.MarkdownDescription
	}
	deprecation := p.DeprecationMessage
	if p.MarkdownDeprecationMessage != "" {
		deprecation = p.MarkdownDeprecationMessage
	}

	name := p.name
	if deprecation != "" {
		name += " (deprecated)"
		desc = deprecation + "\n" + desc
	}

	fmt.Fprintf(b, "%s `%s`\n\n%s", heading, name, desc)

	if enums := enumDescriptionsSnippet(p); enums != "" {
		fmt.Fprintf(b, "<br/>\n%s", enums)
	}

	if defaults := defaultDescriptionSnippet(p); defaults != "" {
		b.WriteString("\n\n")
		if p.Type == "object" {
			fmt.Fprintf(b, "Default:\n```\n%v\n```", defaults)
		} else {
			fmt.Fprintf(b, "Default: `%v`", defaults)
		}
	}
}

func enumDescriptionsSnippet(p *Property) string {
	if len(p.Enum) == 0 {
		return ""
	}
	b := &bytes.Buffer{}
	desc := p.EnumDescriptions
	if len(p.MarkdownEnumDescriptions) != 0 {
		desc = p.MarkdownEnumDescriptions
	}

	hasDesc := false
	for _, d := range desc {
		if d != "" {
			hasDesc = true
			break
		}
	}
	b.WriteString("Allowed Options:")

	if hasDesc && len(desc) == len(p.Enum) {
		b.WriteString("\n\n")
		for i, e := range p.Enum {
			fmt.Fprintf(b, "* `%v`", e)
			if d := desc[i]; d != "" {
				fmt.Fprintf(b, ": %v", strings.TrimRight(strings.ReplaceAll(d, "\n\n", "<br/>"), "\n"))
			}
			b.WriteString("\n")
		}
	} else {
		for i, e := range p.Enum {
			fmt.Fprintf(b, " `%v`", e)
			if i < len(p.Enum)-1 {
				b.WriteString(",")
			}
		}
	}
	return b.String()
}

func defaultDescriptionSnippet(p *Property) string {
	if p.Default == nil {
		return ""
	}
	b := &bytes.Buffer{}
	switch p.Type {
	case "string":
		fmt.Fprintf(b, "%q", p.Default)
	case "boolean", "number":
		fmt.Fprintf(b, "%v", p.Default)
	case "array":
		x, ok := p.Default.([]interface{})
		if !ok {
			panic(fmt.Sprintf("unexpected type for array: %v", *p))
		} else if len(x) > 0 {
			fmt.Fprintf(b, "[")
			for i, v := range x {
				if i > 0 {
					fmt.Fprintf(b, ", ")
				}
				fmt.Fprintf(b, "%q", v)
			}
			fmt.Fprintf(b, "]")
		}
	default:
		fmt.Fprintf(b, "%v", p.Default)
	}
	return b.String()
}
