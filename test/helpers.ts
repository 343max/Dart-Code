import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import * as vs from "vscode";
import { EOL, tmpdir } from "os";
import { Sdks } from "../src/utils";
import { AnalyzerCapabilities } from "../src/analysis/analyzer";
import { DebugConfigProvider } from "../src/providers/debug_config_provider";

export const ext = vs.extensions.getExtension<{
	analysisComplete: Promise<void>,
	analyzerCapabilities: AnalyzerCapabilities,
	debugProvider: DebugConfigProvider,
	sdks: Sdks,
}>("Dart-Code.dart-code");
export const helloWorldFolder = vs.Uri.file(path.join(ext.extensionPath, "test/test_projects/hello_world"));
export const helloWorldMainFile = vs.Uri.file(path.join(helloWorldFolder.fsPath, "bin/main.dart"));
export const helloWorldBrokenFile = vs.Uri.file(path.join(helloWorldFolder.fsPath, "bin/broken.dart"));
export const helloWorldGoodbyeFile = vs.Uri.file(path.join(helloWorldFolder.fsPath, "bin/goodbye.dart"));
export const emptyFile = vs.Uri.file(path.join(helloWorldFolder.fsPath, "lib/empty.dart"));
export const everythingFile = vs.Uri.file(path.join(helloWorldFolder.fsPath, "lib/everything.dart"));
export const flutterHelloWorldFolder = vs.Uri.file(path.join(ext.extensionPath, "test/test_projects/flutter_hello_world"));
export const flutterEmptyFile = vs.Uri.file(path.join(flutterHelloWorldFolder.fsPath, "lib/empty.dart"));
export const flutterHelloWorldMainFile = vs.Uri.file(path.join(flutterHelloWorldFolder.fsPath, "lib/main.dart"));
export const flutterTestMainFile = vs.Uri.file(path.join(flutterHelloWorldFolder.fsPath, "test/hello_test.dart"));
export const flutterTestOtherFile = vs.Uri.file(path.join(flutterHelloWorldFolder.fsPath, "test/other_test.dart"));
export const flutterTestBrokenFile = vs.Uri.file(path.join(flutterHelloWorldFolder.fsPath, "test/broken_test.dart"));

export let doc: vs.TextDocument;
export let editor: vs.TextEditor;
export let eol: string;

export async function activate(file: vs.Uri = emptyFile): Promise<void> {
	await ext.activate();
	await ext.exports.analysisComplete;
	await closeAllOpenFiles();
	doc = await vs.workspace.openTextDocument(file);
	editor = await vs.window.showTextDocument(doc);
	eol = doc.eol === vs.EndOfLine.CRLF ? "\r\n" : "\n";
}

export async function closeAllOpenFiles(): Promise<void> {
	while (vs.window.activeTextEditor) {
		await vs.commands.executeCommand("workbench.action.closeActiveEditor");
	}
}

export async function closeFile(file: vs.Uri): Promise<void> {
	for (const editor of vs.window.visibleTextEditors) {
		if (editor.document.uri === file) {
			await vs.window.showTextDocument(editor.document);
			await vs.commands.executeCommand("workbench.action.closeActiveEditor");
		}
	}
}

export async function openFile(file: vs.Uri): Promise<void> {
	await vs.window.showTextDocument(await vs.workspace.openTextDocument(file));
}

const deferredItems: Array<() => Promise<void> | void> = [];
afterEach(async () => {
	for (const d of deferredItems) {
		await d();
	}
	deferredItems.length = 0;
});
export function defer(callback: () => Promise<void> | void): void {
	deferredItems.push(callback);
}

// Set up log files for individual test logging.
// tslint:disable-next-line:only-arrow-functions
beforeEach(async function () {
	const logFolder = process.env.DC_TEST_LOGS || path.join(ext.extensionPath, ".dart_code_test_logs");
	if (!fs.existsSync(logFolder))
		fs.mkdirSync(logFolder);
	const prefix = filenameSafe(this.currentTest.fullTitle()) + "_";

	await setLogs(
		vs.workspace.getConfiguration("dart"),
		logFolder,
		prefix,
		["analyzer", "flutterDaemon"],
	);
	await setLogs(
		vs.workspace.getConfiguration("dart", vs.workspace.workspaceFolders[0].uri),
		logFolder,
		prefix,
		["observatory", "flutterRun", "flutterTest"],
	);
});

before(() => {
	if (!process.env.DART_CODE_IS_TEST_RUN)
		throw new Error("DART_CODE_IS_TEST_RUN env var should be set for test runs.");
});

async function setLogs(conf: vs.WorkspaceConfiguration, logFolder: string, prefix: string, logFiles: string[]): Promise<void> {
	for (const logFile of logFiles) {
		const key = logFile + "LogFile";
		const logPath = path.join(logFolder, `${prefix}${logFile}.txt`);
		const oldValue = conf.get<string>(key);
		await conf.update(key, logPath);
		// TODO: Don't think is working properly?
		defer(async () => await conf.update(key, oldValue));
	}
}

export function setTestContent(content: string): Thenable<boolean> {
	const all = new vs.Range(
		doc.positionAt(0),
		doc.positionAt(doc.getText().length),
	);
	return editor.edit((eb) => eb.replace(all, content));
}

export function positionOf(searchText: string): vs.Position {
	const doc = vs.window.activeTextEditor.document;
	const caretOffset = searchText.indexOf("^");
	assert.notEqual(caretOffset, -1, `Couldn't find a ^ in search text (${searchText})`);
	const matchedTextIndex = doc.getText().indexOf(searchText.replace("^", "").replace(/\n/g, eol));
	assert.notEqual(matchedTextIndex, -1, `Couldn't find string ${searchText.replace("^", "")} in the document to get position of`);

	return doc.positionAt(matchedTextIndex + caretOffset);
}

export function rangeOf(searchText: string, inside?: vs.Range): vs.Range {
	const doc = vs.window.activeTextEditor.document;
	const startOffset = searchText.indexOf("|");
	assert.notEqual(startOffset, -1, `Couldn't find a | in search text (${searchText})`);
	const endOffset = searchText.lastIndexOf("|");
	assert.notEqual(endOffset, -1, `Couldn't find a second | in search text (${searchText})`);

	const startSearchAt = inside ? doc.offsetAt(inside.start) : 0;
	const endSearchAt = inside ? doc.offsetAt(inside.end) : -1;
	let matchedTextIndex = doc.getText().indexOf(searchText.replace(/\|/g, "").replace(/\n/g, eol), startSearchAt);
	if (endSearchAt > -1 && matchedTextIndex > endSearchAt)
		matchedTextIndex = -1;
	assert.notEqual(matchedTextIndex, -1, `Couldn't find string ${searchText.replace(/\|/g, "")} in the document to get range of`);

	return new vs.Range(
		doc.positionAt(matchedTextIndex + startOffset),
		doc.positionAt(matchedTextIndex + endOffset - 1),
	);
}

export async function getDocumentSymbols(): Promise<vs.SymbolInformation[]> {
	const documentSymbolResult = await (vs.commands.executeCommand("vscode.executeDocumentSymbolProvider", doc.uri) as Thenable<vs.SymbolInformation[]>);
	return documentSymbolResult || [];
}

export async function getWorkspaceSymbols(query: string): Promise<vs.SymbolInformation[]> {
	const workspaceSymbolResult = await (vs.commands.executeCommand("vscode.executeWorkspaceSymbolProvider", query) as Thenable<vs.SymbolInformation[]>);
	return workspaceSymbolResult || [];
}

export function ensureSymbol(symbols: vs.SymbolInformation[], name: string, kind: vs.SymbolKind, containerName: string, uri: vs.Uri = doc.uri): void {
	const symbol = symbols.find((f) =>
		f.name === name
		&& f.kind === kind
		&& f.containerName === containerName,
	);
	assert.ok(
		symbol,
		`Couldn't find symbol for ${name}/${vs.SymbolKind[kind]}/${containerName} in\n`
		+ symbols.map((s) => `        ${s.name}/${vs.SymbolKind[s.kind]}/${s.containerName}`).join("\n"),
	);
	assert.deepStrictEqual(symbol.location.uri.fsPath, uri.fsPath);
	assert.ok(symbol.location);
	assert.ok(symbol.location.range);
	assert.ok(symbol.location.range.start);
	assert.ok(symbol.location.range.start.line);
	assert.ok(symbol.location.range.end);
	assert.ok(symbol.location.range.end.line);
}

export function ensureIsRange(actual: vs.Range, expected: vs.Range) {
	assert.ok(actual);
	assert.equal(actual.start.line, expected.start.line, "Start lines did not match");
	assert.equal(actual.start.character, expected.start.character, "Start characters did not match");
	assert.equal(actual.end.line, expected.end.line, "End lines did not match");
	assert.equal(actual.end.character, expected.end.character, "End characters did not match");
}

export async function getCompletionsAt(searchText: string, triggerCharacter?: string): Promise<vs.CompletionItem[]> {
	const position = positionOf(searchText);
	const results = await (vs.commands.executeCommand("vscode.executeCompletionItemProvider", doc.uri, position, triggerCharacter) as Thenable<vs.CompletionList>);
	return results.items;
}

export async function getSnippetCompletionsAt(searchText: string, triggerCharacter?: string): Promise<vs.CompletionItem[]> {
	const completions = await getCompletionsAt(searchText, triggerCharacter);
	return completions.filter((c) => c.kind === vs.CompletionItemKind.Snippet);
}

export function ensureCompletion(items: vs.CompletionItem[], kind: vs.CompletionItemKind, label: string, filterText: string, documentation?: string): void {
	const completion = items.find((item) =>
		item.label === label
		&& item.filterText === filterText
		&& item.kind === kind,
	);
	assert.ok(
		completion,
		`Couldn't find completion for ${label}/${filterText} in\n`
		+ items.map((item) => `        ${vs.CompletionItemKind[item.kind]}/${item.label}/${item.filterText}`).join("\n"),
	);
	if (documentation) {
		assert.equal(((completion.documentation as any).value as string).trim(), documentation);
	}
}

export function ensureSnippet(items: vs.CompletionItem[], label: string, filterText: string, documentation?: string): void {
	ensureCompletion(items, vs.CompletionItemKind.Snippet, label, filterText, documentation);
}

export function ensureNoCompletion(items: vs.CompletionItem[], kind: vs.CompletionItemKind, label: string): void {
	const completion = items.find((item) =>
		(item.label === label || item.filterText === label)
		&& item.kind === kind,
	);
	assert.ok(
		!completion,
		`Found unexpected completion for ${label}`,
	);
}

export function ensureNoSnippet(items: vs.CompletionItem[], label: string): void {
	ensureNoCompletion(items, vs.CompletionItemKind.Snippet, label);
}

export async function ensureTestContent(expected: string): Promise<void> {
	// Wait for a short period before checking to reduce changes of flaky tests.
	await waitFor(() =>
		doc.getText().replace(/\r/g, "").trim() === expected.replace(/\r/g, "").trim(),
		"Document content did not match expected",
		100,
		false,
	);
	assert.equal(doc.getText().replace(/\r/g, "").trim(), expected.replace(/\r/g, "").trim());
}

export function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function getRandomTempFolder(): string {
	const r = Math.floor(Math.random() * 100000);
	const base = path.join(tmpdir(), "dart-code-tests");
	if (!fs.existsSync(base))
		fs.mkdirSync(base);
	const tmpPath = path.join(base, r.toString());
	if (!fs.existsSync(tmpPath))
		fs.mkdirSync(tmpPath);
	return tmpPath;
}

export async function waitFor(action: () => boolean, message?: string, milliseconds: number = 1000, throwOnFailure = true): Promise<void> {
	let timeRemaining = milliseconds;
	while (timeRemaining > 0) {
		if (action())
			return;
		await new Promise((resolve) => setTimeout(resolve, 100));
		timeRemaining -= 100;
	}
	if (throwOnFailure)
		throw new Error("Action didn't return true within specified timeout" + (message ? ` (${message})` : ""));
}

export async function waitForEditorChange(action: () => Thenable<void>): Promise<void> {
	const oldVersion = doc.version;
	await action();
	await waitFor(() => doc.version !== oldVersion);
}

export function filenameSafe(input: string) {
	return input.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}
