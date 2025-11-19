import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { BinaryWriter } from '@protobuf-ts/runtime';
import { GetDeepWikiRequest as PBGetDeepWikiRequest } from '../../src/generated/deepwiki_full';

// The test reads a static JSON copied from the project root deepwiki_request.json
// and performs one Connect POST using generated protobuf types.

function ensureFixtureCopied(): string {
  const here = __dirname; // compiled test dir: context-code-text/out/test
  const src = path.resolve(here, '../../..', 'deepwiki_request.json'); // repo root
  const destDir = path.resolve(here, '../../test-data'); // context-code-text/out/test-data
  const dest = path.join(destDir, 'deepwiki_request.json');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const content = fs.readFileSync(src, 'utf8');
  fs.writeFileSync(dest, content, 'utf8');
  return dest;
}

function readFixtureJson(): any {
  const here = __dirname;
  const fixturePath = path.resolve(here, '../../test-data/deepwiki_request.json');
  const raw = fs.readFileSync(fixturePath, 'utf8');
  return JSON.parse(raw);
}

function buildHeaders(base: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base || {})) {
    if (!k || v == null) continue;
    if (k.toLowerCase() === 'content-length') continue;
    if (k.toLowerCase() === 'host') continue;
    if (k.toLowerCase() === 'connection') continue;
    if (k.toLowerCase() === 'transfer-encoding') continue;
    out[k] = String(v);
  }
  // Ensure required Connect headers
  if (!Object.keys(out).some(k => k.toLowerCase() === 'content-type')) out['content-type'] = 'application/connect+proto';
  if (!Object.keys(out).some(k => k.toLowerCase() === 'connect-protocol-version')) out['connect-protocol-version'] = '1';
  if (!Object.keys(out).some(k => k.toLowerCase() === 'connect-content-encoding')) out['connect-content-encoding'] = 'gzip';
  if (!Object.keys(out).some(k => k.toLowerCase() === 'connect-accept-encoding')) out['connect-accept-encoding'] = 'gzip';
  if (!Object.keys(out).some(k => k.toLowerCase() === 'accept-encoding')) out['accept-encoding'] = 'identity';
  return out;
}

function buildBodyFromJson(jsonObj: any): Uint8Array {
  const msg: any = {
    metadata: {
      ideName: String(jsonObj?.metadata?.ide_name ?? ''),
      extensionVersion: String(jsonObj?.metadata?.extension_version ?? ''),
      apiKey: String(jsonObj?.metadata?.api_key ?? ''),
      locale: String(jsonObj?.metadata?.locale ?? ''),
      osInfoJson: String(jsonObj?.metadata?.os_info_json ?? ''),
      ideVersion: String(jsonObj?.metadata?.ide_version ?? ''),
      hardwareInfoJson: String(jsonObj?.metadata?.hardware_info_json ?? ''),
      workspaceId: String(jsonObj?.metadata?.workspace_id ?? ''),
      extensionName: String(jsonObj?.metadata?.extension_name ?? ''),
      authToken: String(jsonObj?.metadata?.auth_token ?? ''),
      sessionId: String(jsonObj?.metadata?.session_id ?? ''),
      osEdition: String(jsonObj?.metadata?.os_edition ?? ''),
      machineId: ''
    },
    requestType: jsonObj?.request_type === 'DEEP_WIKI_REQUEST_TYPE_ARTICLE' ? 2 : 0,
    symbolName: String(jsonObj?.symbol_name ?? ''),
    symbolUri: String(jsonObj?.symbol_uri ?? ''),
    context: String(jsonObj?.context ?? ''),
    // Accept numeric symbol type if present from fixture; fall back to 0
    symbolType: typeof jsonObj?.symbol_type === 'number' ? jsonObj.symbol_type : 0,
    language: String(jsonObj?.language ?? ''),
    modelType: jsonObj?.model_type === 'DEEP_WIKI_MODEL_TYPE_CAPACITY_FALLBACK' ? 1 : 0
  };
  const writer = new BinaryWriter();
  PBGetDeepWikiRequest.internalBinaryWrite(msg, writer, {
    writeUnknownFields: false,
    writerFactory: () => new BinaryWriter()
  } as any);
  const proto = writer.finish();
  const gz = zlib.gzipSync(Buffer.from(proto));
  const frame = Buffer.alloc(1 + 4 + gz.length);
  frame.writeUInt8(0x01, 0);
  frame.writeUInt32BE(gz.length, 1);
  gz.copy(frame, 5);
  return frame;
}

suite('DeepWiki Integration Smoke', () => {
  test('activate and send one DeepWiki request from fixture', async function () {
    // Allow network; increase timeout for a single call
    this.timeout(30000);
    // Activate extension
    await vscode.extensions.getExtension('context-code-text')?.activate();

    ensureFixtureCopied();
    const fixture = readFixtureJson();
    const url: string = fixture.url;
    const headers = buildHeaders(fixture.headers || {});
    const body = buildBodyFromJson(fixture.request_json || {});

    // Use global fetch if available (VS Code >=1.90 on Node18), otherwise dynamic require
    const doFetch: typeof fetch = (globalThis as any).fetch ?? (await import('node-fetch')).default as any;

    const resp = await doFetch(url, {
      method: (fixture.method || 'POST').toUpperCase(),
      headers: headers as any,
      body
    } as any);

    assert.ok(resp.ok, `HTTP ${resp.status} ${resp.statusText}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    // Basic sanity: at least one Connect frame header present
    assert.ok(buf.length >= 5, 'response too short');
  });
});
