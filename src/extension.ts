import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { NodeCreatorService } from './nodeCreatorService';
import { NodeContextService } from './context/nodeContextService';
import { NodeScoreService } from './nodeScoreService';
import { LspService } from './lspService';
import { TraceService } from './traceService';
import { disposeOutputChannel } from './outputChannel';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { BinaryWriter, BinaryReader } from '@protobuf-ts/runtime';
import { GetDeepWikiRequest as PBGetDeepWikiRequest, GetDeepWikiResponse as PBGetDeepWikiResponse } from './generated/deepwiki_full';
import { ServiceRegistry } from './types';
import { runWindsurfLogin } from './windsurfLogin';
import { ContextWebviewViewProvider } from './contextView';

let disposables: vscode.Disposable[] = [];
const HAS_OUTLINE_CONTEXT_KEY = 'contextCodeText.hasOutlineContext';
let contextUpdateToken = 0;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	// Run DeepWiki startup smoke test and log to 'Code Context Test'
	void runStartupDeepwikiSmokeTest();
	const lsp = new LspService(vscode.commands, vscode.workspace);
	const nodeScore = new NodeScoreService();
	const nodeCreator = new NodeCreatorService(lsp);
	const nodeContext = new NodeContextService();
	const trace = new TraceService(nodeScore, nodeCreator);

	const registry: ServiceRegistry = { lsp, trace, nodeContext };
	nodeCreator.setRegistry(registry);

	disposables = registerCommands(nodeCreator);

	const loginDisposable = vscode.commands.registerCommand('context-code-text.loginWindsurf', () => {
		void runWindsurfLogin();
	});

	const contextViewProvider = new ContextWebviewViewProvider(nodeCreator);
	const viewDisposable = vscode.window.registerWebviewViewProvider('contextCodeText.contextView', contextViewProvider);

	const deepwikiDisposable = vscode.commands.registerCommand('context-code-text.showDeepWiki', () => {
		void contextViewProvider.updateForEditor(vscode.window.activeTextEditor ?? undefined);
	});

	context.subscriptions.push(lsp, ...disposables, loginDisposable, viewDisposable, deepwikiDisposable);
	registerContextKeyUpdater(context, nodeCreator);
}

export function deactivate(): void {
	disposables.forEach(d => d.dispose());
	disposables = [];

	disposeOutputChannel();
}

function registerContextKeyUpdater(context: vscode.ExtensionContext, nodeCreator: NodeCreatorService): void {
	const update = async (editor: vscode.TextEditor | undefined): Promise<void> => {
		const token = ++contextUpdateToken;
		let hasOutline = false;
		try {
			if (editor) {
				const selection = editor.selection;
				const position = selection.isEmpty ? selection.active : selection.start;
				const node = await nodeCreator.getRichNode(editor.document.uri, position);
				if (node) {
					hasOutline = node.hasOutlineElement() || !!(await node.ensureOutlineElement());
				}
			}
		} catch {
			hasOutline = false;
		}
		if (token === contextUpdateToken) {
			await vscode.commands.executeCommand('setContext', HAS_OUTLINE_CONTEXT_KEY, hasOutline);
		}
	};

	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection(event => {
			void update(event.textEditor);
		}),
		vscode.window.onDidChangeActiveTextEditor(editor => {
			void update(editor ?? undefined);
		})
	);

	void update(vscode.window.activeTextEditor ?? undefined);
}

async function runStartupDeepwikiSmokeTest(): Promise<void> {
    const ch = vscode.window.createOutputChannel('Code Context Test');
    ch.appendLine('[StartupTest] DeepWiki startup smoke test running...');
    try {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
            ch.appendLine('[StartupTest] No workspace root; skipping.');
            return;
        }
        const fixturePath = path.join(root, 'deepwiki_request.json');
        if (!fs.existsSync(fixturePath)) {
            ch.appendLine(`[StartupTest] Missing fixture: ${fixturePath}`);
            return;
        }
        const raw = fs.readFileSync(fixturePath, 'utf8');
        const obj = JSON.parse(raw);
        const url: string = obj.url;
        const method: string = String(obj.method || 'POST').toUpperCase();
        const headersIn: Record<string, string> = obj.headers || {};
        const reqJson: any = obj.request_json || {};

        // sanitize + ensure connect headers
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(headersIn)) {
            if (!k || v == null) continue;
            const kl = k.toLowerCase();
            if (kl === 'content-length' || kl === 'host' || kl === 'connection' || kl === 'transfer-encoding') continue;
            headers[k] = String(v);
        }
        if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) headers['content-type'] = 'application/connect+proto';
        if (!Object.keys(headers).some(k => k.toLowerCase() === 'connect-protocol-version')) headers['connect-protocol-version'] = '1';
        if (!Object.keys(headers).some(k => k.toLowerCase() === 'connect-content-encoding')) headers['connect-content-encoding'] = 'gzip';
        if (!Object.keys(headers).some(k => k.toLowerCase() === 'connect-accept-encoding')) headers['connect-accept-encoding'] = 'gzip';
        if (!Object.keys(headers).some(k => k.toLowerCase() === 'accept-encoding')) headers['accept-encoding'] = 'identity';

        // Build protobuf from JSON via generated types
        const message: PBGetDeepWikiRequest = {
            metadata: {
                ideName: String(reqJson?.metadata?.ide_name ?? ''),
                extensionVersion: String(reqJson?.metadata?.extension_version ?? ''),
                apiKey: String(reqJson?.metadata?.api_key ?? ''),
                locale: String(reqJson?.metadata?.locale ?? ''),
                osInfoJson: String(reqJson?.metadata?.os_info_json ?? ''),
                ideVersion: String(reqJson?.metadata?.ide_version ?? ''),
                hardwareInfoJson: String(reqJson?.metadata?.hardware_info_json ?? ''),
                workspaceId: String(reqJson?.metadata?.workspace_id ?? ''),
                extensionName: String(reqJson?.metadata?.extension_name ?? ''),
                authToken: String(reqJson?.metadata?.auth_token ?? ''),
                sessionId: String(reqJson?.metadata?.session_id ?? ''),
                osEdition: String(reqJson?.metadata?.os_edition ?? ''),
                machineId: ''
            },
            requestType: String(reqJson?.request_type ?? '') === 'DEEP_WIKI_REQUEST_TYPE_ARTICLE' ? 2 as any : 0 as any,
            symbolName: String(reqJson?.symbol_name ?? ''),
            symbolUri: String(reqJson?.symbol_uri ?? ''),
            context: String(reqJson?.context ?? ''),
            symbolType: (typeof reqJson?.symbol_type === 'number' ? reqJson.symbol_type : 0) as any,
            language: String(reqJson?.language ?? ''),
            modelType: String(reqJson?.model_type ?? '') === 'DEEP_WIKI_MODEL_TYPE_CAPACITY_FALLBACK' ? 1 as any : 0 as any,
        };
        const writer = new BinaryWriter();
        PBGetDeepWikiRequest.internalBinaryWrite(message, writer, {
            writeUnknownFields: false,
            writerFactory: () => new BinaryWriter()
        } as any);
        const proto = writer.finish();
        const gz = zlib.gzipSync(Buffer.from(proto));
        const frame = Buffer.alloc(1 + 4 + gz.length);
        frame.writeUInt8(0x01, 0);
        frame.writeUInt32BE(gz.length, 1);
        gz.copy(frame, 5);

        ch.appendLine('[StartupTest] URL: ' + url);
        ch.appendLine('[StartupTest] Headers:');
        for (const [k, v] of Object.entries(headers)) ch.appendLine(`  ${k}: ${v}`);
        ch.appendLine('[StartupTest] Body bytes: ' + frame.length);

        const doFetch: any = (globalThis as any).fetch;
        if (!doFetch) {
            ch.appendLine('[StartupTest] global fetch unavailable; skipping network call.');
            return;
        }
        const resp = await doFetch(url, { method, headers, body: frame });
        ch.appendLine(`[StartupTest] Response: ${resp.status} ${resp.statusText}`);
        const arr = await resp.arrayBuffer();
        const buf = Buffer.from(arr);
        ch.appendLine('[StartupTest] Response bytes: ' + buf.length);

        // Parse Connect frames fully and print details
        let offset = 0;
        let frameIndex = 0;
        while (offset + 5 <= buf.length) {
            const flags = buf[offset];
            const len = (buf[offset + 1] << 24) | (buf[offset + 2] << 16) | (buf[offset + 3] << 8) | buf[offset + 4];
            offset += 5;
            if (len < 0 || offset + len > buf.length) {
                ch.appendLine('[StartupTest] Frame length invalid, stopping parse.');
                break;
            }
            const frameBuf = buf.slice(offset, offset + len);
            offset += len;
            frameIndex++;
            const compressed = (flags & 0x01) !== 0;
            const end = (flags & 0x02) !== 0;
            ch.appendLine(`[StartupTest] Frame #${frameIndex}: flags=${flags} len=${len} compressed=${compressed} end=${end}`);
            ch.appendLine('[StartupTest]   frame hex (first 256): ' + frameBuf.toString('hex').slice(0, 256));
            let payload = frameBuf;
            if (compressed) {
                try {
                    payload = zlib.gunzipSync(frameBuf);
                } catch (e) {
                    ch.appendLine('[StartupTest]   gunzip failed: ' + (e as any)?.message);
                }
            }
            ch.appendLine('[StartupTest]   payload hex (first 256): ' + payload.toString('hex').slice(0, 256));
            if (end) {
                const txt = payload.toString('utf8');
                const trimmed = txt.trimStart();
                ch.appendLine('[StartupTest]   end-stream text (first 1000):');
                ch.appendLine(trimmed.slice(0, 1000));
                // Try pretty JSON
                try {
                    const obj = JSON.parse(trimmed);
                    ch.appendLine('[StartupTest]   end-stream JSON (pretty):');
                    ch.appendLine(JSON.stringify(obj, null, 2));
                } catch {}
                continue;
            }
            // Non end-stream: try protobuf decode
            try {
                const reader = new BinaryReader(payload);
                const msg = PBGetDeepWikiResponse.internalBinaryRead(reader, payload.length, {
                    readUnknownField: false,
                    readerFactory: (bytes: Uint8Array) => new BinaryReader(bytes)
                } as any);
                const td = msg.response?.textDelta ?? '';
                const modelType = msg.modelType;
                const progress = (msg as any).progress ?? (msg.response as any)?.progress;
                ch.appendLine('[StartupTest]   protobuf decoded:');
                ch.appendLine('      modelType=' + String(modelType) + ' progress=' + String(progress));
                if (td) ch.appendLine('      text_delta (first 500): ' + td.slice(0, 500));
            } catch (e) {
                ch.appendLine('[StartupTest]   protobuf decode failed: ' + (e as any)?.message);
            }
        }
    } catch (err: any) {
        ch.appendLine('[StartupTest] Error: ' + (err?.stack || String(err)));
    }
}
