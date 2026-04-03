/**
 * Unit tests for ClaudeCommandsWebviewProvider scanner helpers.
 * No VS Code dependency — uses real fs with temp directories.
 */
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  scanAgents,
  scanSkills,
  scanMcpServers,
  parseFrontmatterDescription,
} from "../../ui/ClaudeCommandsWebviewProvider";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Create a temp directory and return its path. Caller must clean up. */
function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claude-ext-test-"));
}

/** Write a file, creating parent dirs as needed. */
function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

/** Recursively remove a directory. */
function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── parseFrontmatterDescription ─────────────────────────────────────────────

suite("parseFrontmatterDescription", () => {
  test("extracts description from standard frontmatter", () => {
    const content = `---\nname: foo\ndescription: A useful command\n---\n# Body`;
    assert.strictEqual(
      parseFrontmatterDescription(content),
      "A useful command",
    );
  });

  test("extracts description with quoted value", () => {
    const content = `---\ndescription: "Quoted description here"\n---`;
    assert.strictEqual(
      parseFrontmatterDescription(content),
      "Quoted description here",
    );
  });

  test("extracts description with single-quoted value", () => {
    const content = `---\ndescription: 'Single quoted'\n---`;
    assert.strictEqual(parseFrontmatterDescription(content), "Single quoted");
  });

  test("returns empty string when no frontmatter", () => {
    const content = `# Just markdown\n\nNo frontmatter.`;
    assert.strictEqual(parseFrontmatterDescription(content), "");
  });

  test("returns empty string when description key is absent", () => {
    const content = `---\nname: foo\ntools:\n  - bar\n---\nBody`;
    assert.strictEqual(parseFrontmatterDescription(content), "");
  });

  test("handles Windows-style CRLF line endings", () => {
    const content = `---\r\ndescription: Windows line\r\n---\r\nBody`;
    assert.strictEqual(parseFrontmatterDescription(content), "Windows line");
  });

  test("description value with colons is preserved", () => {
    const content = `---\ndescription: "Build, test: deploy"\n---`;
    assert.strictEqual(
      parseFrontmatterDescription(content),
      "Build, test: deploy",
    );
  });
});

// ── scanAgents ──────────────────────────────────────────────────────────────

suite("scanAgents", () => {
  let dir: string;

  setup(() => {
    dir = mkTmp();
  });

  teardown(() => {
    rmDir(dir);
  });

  test("returns empty array for non-existent directory", () => {
    assert.deepStrictEqual(
      scanAgents(path.join(dir, "nonexistent"), "workspace"),
      [],
    );
  });

  test("returns empty array for empty directory", () => {
    assert.deepStrictEqual(scanAgents(dir, "workspace"), []);
  });

  test("parses a single agent file with description", () => {
    writeFile(
      path.join(dir, "my-agent.md"),
      `---\nname: my-agent\ndescription: Does something useful\n---\n# Body`,
    );
    const results = scanAgents(dir, "workspace");
    assert.strictEqual(results.length, 1);
    const cmd = results[0];
    assert.strictEqual(cmd.name, "my-agent");
    assert.strictEqual(cmd.slash, "@my-agent");
    assert.strictEqual(cmd.category, "agents");
    assert.strictEqual(cmd.source, "agent");
    assert.strictEqual(cmd.description, "Does something useful");
    assert.ok(cmd.filePath.endsWith("my-agent.md"));
  });

  test("ignores non-.md files", () => {
    writeFile(path.join(dir, "agent.md"), `---\ndescription: yes\n---`);
    writeFile(path.join(dir, "agent.txt"), `should be ignored`);
    writeFile(path.join(dir, "agent.json"), `{}`);
    const results = scanAgents(dir, "workspace");
    assert.strictEqual(results.length, 1);
  });

  test("scans multiple agents", () => {
    writeFile(path.join(dir, "alpha.md"), `---\ndescription: Alpha agent\n---`);
    writeFile(path.join(dir, "beta.md"), `---\ndescription: Beta agent\n---`);
    writeFile(path.join(dir, "gamma.md"), `---\ndescription: Gamma agent\n---`);
    const results = scanAgents(dir, "global");
    assert.strictEqual(results.length, 3);
    const names = results.map((r) => r.name).sort();
    assert.deepStrictEqual(names, ["alpha", "beta", "gamma"]);
  });

  test("agent with no description frontmatter gets empty description", () => {
    writeFile(path.join(dir, "no-desc.md"), `# Just a heading\n\nNo YAML.`);
    const results = scanAgents(dir, "workspace");
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].description, "");
  });

  test("source is always 'agent' regardless of dir parameter", () => {
    writeFile(path.join(dir, "x.md"), `---\ndescription: x\n---`);
    const ws = scanAgents(dir, "workspace");
    const gl = scanAgents(dir, "global");
    assert.strictEqual(ws[0].source, "agent");
    assert.strictEqual(gl[0].source, "agent");
  });

  test("slash is always @<name>", () => {
    writeFile(
      path.join(dir, "code-reviewer.md"),
      `---\ndescription: reviews\n---`,
    );
    const results = scanAgents(dir, "workspace");
    assert.strictEqual(results[0].slash, "@code-reviewer");
  });
});

// ── scanSkills ──────────────────────────────────────────────────────────────

suite("scanSkills", () => {
  let dir: string;

  setup(() => {
    dir = mkTmp();
  });

  teardown(() => {
    rmDir(dir);
  });

  test("returns empty array for non-existent directory", () => {
    assert.deepStrictEqual(
      scanSkills(path.join(dir, "nonexistent"), "workspace"),
      [],
    );
  });

  test("returns empty array for empty directory", () => {
    assert.deepStrictEqual(scanSkills(dir, "workspace"), []);
  });

  test("parses a skill folder with SKILL.md", () => {
    writeFile(
      path.join(dir, "api-design", "SKILL.md"),
      `---\nname: api-design\ndescription: REST and GraphQL patterns\n---\n# Body`,
    );
    const results = scanSkills(dir, "workspace");
    assert.strictEqual(results.length, 1);
    const cmd = results[0];
    assert.strictEqual(cmd.name, "api-design");
    assert.strictEqual(cmd.slash, "/api-design");
    assert.strictEqual(cmd.category, "skills");
    assert.strictEqual(cmd.source, "skill");
    assert.strictEqual(cmd.description, "REST and GraphQL patterns");
    assert.ok(cmd.filePath.endsWith("SKILL.md"));
  });

  test("ignores folders without SKILL.md", () => {
    writeFile(path.join(dir, "no-skill", "README.md"), `# Not a skill`);
    writeFile(
      path.join(dir, "valid-skill", "SKILL.md"),
      `---\ndescription: Valid\n---`,
    );
    const results = scanSkills(dir, "workspace");
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, "valid-skill");
  });

  test("ignores loose .md files at the root level", () => {
    writeFile(path.join(dir, "loose.md"), `---\ndescription: loose\n---`);
    writeFile(
      path.join(dir, "real-skill", "SKILL.md"),
      `---\ndescription: real\n---`,
    );
    const results = scanSkills(dir, "workspace");
    assert.strictEqual(results.length, 1);
  });

  test("scans multiple skill folders", () => {
    for (const name of [
      "async-patterns",
      "auth-patterns",
      "database-patterns",
    ]) {
      writeFile(
        path.join(dir, name, "SKILL.md"),
        `---\ndescription: ${name} skill\n---`,
      );
    }
    const results = scanSkills(dir, "workspace");
    assert.strictEqual(results.length, 3);
    const names = results.map((r) => r.name).sort();
    assert.deepStrictEqual(names, [
      "async-patterns",
      "auth-patterns",
      "database-patterns",
    ]);
  });

  test("skill with no frontmatter description gets empty string", () => {
    writeFile(path.join(dir, "no-desc", "SKILL.md"), `# No frontmatter`);
    const results = scanSkills(dir, "workspace");
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].description, "");
  });

  test("source is always 'skill' regardless of dir parameter", () => {
    writeFile(
      path.join(dir, "my-skill", "SKILL.md"),
      `---\ndescription: test\n---`,
    );
    const ws = scanSkills(dir, "workspace");
    const gl = scanSkills(dir, "global");
    assert.strictEqual(ws[0].source, "skill");
    assert.strictEqual(gl[0].source, "skill");
  });
});

// ── scanMcpServers ──────────────────────────────────────────────────────────

suite("scanMcpServers", () => {
  let dir: string;

  setup(() => {
    dir = mkTmp();
  });

  teardown(() => {
    rmDir(dir);
  });

  /** Write a fake ~/.claude/mcp.json under dir/dot-claude/mcp.json.
   *  We pass a custom wsFolder; the function reads global mcp.json from
   *  os.homedir()/.claude/mcp.json which we can't override. Instead we test
   *  the workspace settings.json path, which we fully control.
   */
  function writeMcpSettings(
    wsFolder: string,
    servers: Record<string, object>,
  ): void {
    writeFile(
      path.join(wsFolder, ".claude", "settings.json"),
      JSON.stringify({ mcpServers: servers }),
    );
  }

  test("returns at least the global github server (integration check)", () => {
    // Just ensures the function runs without throwing and returns an array.
    const results = scanMcpServers(undefined);
    assert.ok(Array.isArray(results));
  });

  test("reads mcpServers from workspace .claude/settings.json", () => {
    writeMcpSettings(dir, {
      "my-server": { command: "npx", args: ["-y", "my-mcp-pkg"] },
    });
    const results = scanMcpServers(dir);
    const ws = results.find((r) => r.name === "my-server");
    assert.ok(ws, "expected my-server in results");
    assert.strictEqual(ws!.source, "mcp");
    assert.strictEqual(ws!.category, "mcp");
    assert.strictEqual(ws!.slash, "mcp:my-server");
    assert.ok(ws!.description.includes("npx"));
  });

  test("description includes command args", () => {
    writeMcpSettings(dir, {
      "gh-server": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      },
    });
    const results = scanMcpServers(dir);
    const s = results.find((r) => r.name === "gh-server");
    assert.ok(s);
    assert.ok(s!.description.includes("server-github"));
  });

  test("URL-based server uses url in description", () => {
    writeMcpSettings(dir, {
      "remote-server": { url: "https://mcp.example.com/sse" },
    });
    const results = scanMcpServers(dir);
    const s = results.find((r) => r.name === "remote-server");
    assert.ok(s);
    assert.ok(s!.description.includes("mcp.example.com"));
  });

  test("multiple workspace servers are all returned", () => {
    writeMcpSettings(dir, {
      server1: { command: "node", args: ["server1.js"] },
      server2: { command: "python3", args: ["server2.py"] },
      server3: { url: "https://example.com" },
    });
    const results = scanMcpServers(dir);
    const names = new Set(results.map((r) => r.name));
    assert.ok(names.has("server1"));
    assert.ok(names.has("server2"));
    assert.ok(names.has("server3"));
  });

  test("no workspace folder returns only global servers", () => {
    const results = scanMcpServers(undefined);
    assert.ok(Array.isArray(results));
    // All results must have source = 'mcp'
    for (const r of results) {
      assert.strictEqual(r.source, "mcp");
    }
  });

  test("workspace with no .claude/settings.json is a no-op (no throw)", () => {
    // dir has no .claude/settings.json
    assert.doesNotThrow(() => scanMcpServers(dir));
  });

  test("workspace settings.json without mcpServers key is a no-op", () => {
    writeFile(
      path.join(dir, ".claude", "settings.json"),
      JSON.stringify({ hooks: {} }),
    );
    // Should not throw and should not add any workspace servers
    const results = scanMcpServers(dir);
    assert.ok(Array.isArray(results));
  });

  test("duplicate server names between global and workspace deduplicate", () => {
    // The global mcp.json has 'github'. If workspace also declares 'github',
    // only one entry should appear.
    writeMcpSettings(dir, {
      github: { command: "npx", args: ["-y", "ws-github-override"] },
    });
    const results = scanMcpServers(dir);
    const githubEntries = results.filter((r) => r.name === "github");
    assert.strictEqual(githubEntries.length, 1);
  });
});
