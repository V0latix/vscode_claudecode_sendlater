import * as vscode from 'vscode';

/**
 * Ensure a directory exists using workspace.fs (works on Remote/WSL/SSH).
 * Creates all intermediate directories.
 */
export async function ensureDir(uri: vscode.Uri): Promise<void> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type !== vscode.FileType.Directory) {
      throw new Error(`Path exists but is not a directory: ${uri.fsPath}`);
    }
  } catch (err: unknown) {
    // FileSystemError with code FileNotFound → create it
    const fsErr = err as { code?: string };
    if (fsErr.code === 'FileNotFound' || (err instanceof vscode.FileSystemError && err.code === 'FileNotFound')) {
      await vscode.workspace.fs.createDirectory(uri);
    } else {
      throw err;
    }
  }
}

/**
 * Resolve collisions: if the file at `uri` already exists, append _2, _3, …
 * Returns a URI guaranteed not to exist yet.
 */
export async function resolveCollision(uri: vscode.Uri): Promise<vscode.Uri> {
  let candidate = uri;
  let attempt = 1;

  while (true) {
    try {
      await vscode.workspace.fs.stat(candidate);
      // File exists — try next suffix
      attempt++;
      const base = uri.path.replace(/(\.[^.]+)$/, '');
      const ext = uri.path.match(/(\.[^.]+)$/)?.[1] ?? '';
      candidate = uri.with({ path: `${base}_${attempt}${ext}` });
    } catch {
      // Does not exist → safe to use
      return candidate;
    }
  }
}

/**
 * Write UTF-8 text to a Uri using workspace.fs.
 */
export async function writeText(uri: vscode.Uri, text: string): Promise<void> {
  const encoded = Buffer.from(text, 'utf-8');
  await vscode.workspace.fs.writeFile(uri, encoded);
}

/**
 * Read UTF-8 text from a Uri.
 */
export async function readText(uri: vscode.Uri): Promise<string> {
  const data = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(data).toString('utf-8');
}
