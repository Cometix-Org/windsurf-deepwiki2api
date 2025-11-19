import * as vscode from 'vscode';
import * as os from 'os';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { BinaryWriter, BinaryReader } from '@protobuf-ts/runtime';
import { GetDeepWikiRequest as PBGetDeepWikiRequest, GetDeepWikiResponse as PBGetDeepWikiResponse, Metadata as PBMetadata } from './generated/deepwiki_full';
import { getOutputChannel } from './outputChannel';

type DeepwikiRequestType = 0 | 1 | 2;
type DeepwikiSymbolType = number;
type DeepwikiModelType = 0 | 1 | 2 | 3 | 4;

export interface DeepwikiContextParams {
	symbolName: string;
	symbolUri: string;
	symbolType: DeepwikiSymbolType;
	fileContext: string | undefined;
	usageContext: string | undefined;
	traceContext: string | undefined;
	quickGrepContext: string | undefined;
	fullGrepContext: string | undefined;
}

function ensureWorkspaceId(): string {
	const config = vscode.workspace.getConfiguration('context-code-text');
	let id = config.get<string>('workspaceId');
	if (!id) {
		const buf = crypto.randomBytes(16);
		buf[6] = (buf[6] & 0x0f) | 0x40;
		buf[8] = (buf[8] & 0x3f) | 0x80;
		const hex = buf.toString('hex');
		id = `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
		void config.update('workspaceId', id, vscode.ConfigurationTarget.Global);
	}
	return id;
}

function generateSessionId(): string {
	const buf = crypto.randomBytes(16);
	buf[6] = (buf[6] & 0x0f) | 0x40;
	buf[8] = (buf[8] & 0x3f) | 0x80;
	// DeepWiki HAR 中的 session_id 是纯 32 位 hex，不带连字符
	return buf.toString('hex');
}

function buildOsInfoJson(): string {
	const release = os.release();
	const totalMem = os.totalmem();
	const info = {
		Os: 'windows',
		Arch: os.arch(),
		Version: '6.3',
		ProductName: 'Windows 10 Pro',
		MajorVersionNumber: 10,
		MinorVersionNumber: 0,
		Build: release
	};
	return JSON.stringify(info);
}

function buildHardwareInfoJson(): string {
	const cpus = os.cpus() ?? [];
	const model = cpus[0]?.model ?? '';
	const threads = cpus.length;
	const cores = Math.max(1, Math.floor(threads / 2));
	const info = {
		NumSockets: 1,
		NumCores: cores,
		NumThreads: threads,
		VendorID: 'GenuineIntel',
		Family: '207',
		Model: '',
		ModelName: model,
		Memory: os.totalmem()
	};
	return JSON.stringify(info);
}

function buildContextText(params: DeepwikiContextParams): string {
	const sections: string[] = [];
	if (params.fileContext) {
		sections.push(params.fileContext);
	}
	if (params.usageContext) {
		sections.push(params.usageContext);
	}
	if (params.traceContext) {
		sections.push(params.traceContext);
	}
	if (params.quickGrepContext) {
		sections.push(params.quickGrepContext);
	}
	if (params.fullGrepContext) {
		sections.push(params.fullGrepContext);
	}
	return sections.join('\n\n');
}

function deepwikiSymbolTypeName(value: DeepwikiSymbolType): string {
	const map: Record<number, string> = {
		0: 'DEEP_WIKI_SYMBOL_TYPE_UNSPECIFIED',
		1: 'DEEP_WIKI_SYMBOL_TYPE_FILE',
		2: 'DEEP_WIKI_SYMBOL_TYPE_MODULE',
		3: 'DEEP_WIKI_SYMBOL_TYPE_NAMESPACE',
		4: 'DEEP_WIKI_SYMBOL_TYPE_PACKAGE',
		5: 'DEEP_WIKI_SYMBOL_TYPE_CLASS',
		6: 'DEEP_WIKI_SYMBOL_TYPE_METHOD',
		7: 'DEEP_WIKI_SYMBOL_TYPE_PROPERTY',
		8: 'DEEP_WIKI_SYMBOL_TYPE_FIELD',
		9: 'DEEP_WIKI_SYMBOL_TYPE_CONSTRUCTOR',
		10: 'DEEP_WIKI_SYMBOL_TYPE_ENUM',
		11: 'DEEP_WIKI_SYMBOL_TYPE_INTERFACE',
		12: 'DEEP_WIKI_SYMBOL_TYPE_FUNCTION',
		13: 'DEEP_WIKI_SYMBOL_TYPE_VARIABLE',
		14: 'DEEP_WIKI_SYMBOL_TYPE_CONSTANT',
		15: 'DEEP_WIKI_SYMBOL_TYPE_STRING',
		16: 'DEEP_WIKI_SYMBOL_TYPE_NUMBER',
		17: 'DEEP_WIKI_SYMBOL_TYPE_BOOLEAN',
		18: 'DEEP_WIKI_SYMBOL_TYPE_ARRAY',
		19: 'DEEP_WIKI_SYMBOL_TYPE_OBJECT',
		20: 'DEEP_WIKI_SYMBOL_TYPE_KEY',
		21: 'DEEP_WIKI_SYMBOL_TYPE_NULL',
		22: 'DEEP_WIKI_SYMBOL_TYPE_ENUM_MEMBER',
		23: 'DEEP_WIKI_SYMBOL_TYPE_STRUCT',
		24: 'DEEP_WIKI_SYMBOL_TYPE_EVENT',
		25: 'DEEP_WIKI_SYMBOL_TYPE_OPERATOR',
		26: 'DEEP_WIKI_SYMBOL_TYPE_TYPE_PARAMETER'
	};
	return map[value] ?? 'DEEP_WIKI_SYMBOL_TYPE_UNSPECIFIED';
}

function deepwikiModelTypeName(value: DeepwikiModelType): string {
	const map: Record<number, string> = {
		0: 'DEEP_WIKI_MODEL_TYPE_UNSPECIFIED',
		1: 'DEEP_WIKI_MODEL_TYPE_CAPACITY_FALLBACK',
		2: 'DEEP_WIKI_MODEL_TYPE_LITE_FREE',
		3: 'DEEP_WIKI_MODEL_TYPE_LITE_PAID',
		4: 'DEEP_WIKI_MODEL_TYPE_PREMIUM'
	};
	return map[value] ?? 'DEEP_WIKI_MODEL_TYPE_UNSPECIFIED';
}

function deepwikiRequestTypeNumber(name: string): DeepwikiRequestType {
    const map: Record<string, DeepwikiRequestType> = {
        'DEEP_WIKI_REQUEST_TYPE_UNSPECIFIED': 0,
        'DEEP_WIKI_REQUEST_TYPE_SIDEBAR': 1,
        'DEEP_WIKI_REQUEST_TYPE_ARTICLE': 2
    };
    return map[name] ?? 0;
}

function deepwikiModelTypeNumber(name: string): DeepwikiModelType {
    const map: Record<string, DeepwikiModelType> = {
        'DEEP_WIKI_MODEL_TYPE_UNSPECIFIED': 0,
        'DEEP_WIKI_MODEL_TYPE_CAPACITY_FALLBACK': 1,
        'DEEP_WIKI_MODEL_TYPE_LITE_FREE': 2,
        'DEEP_WIKI_MODEL_TYPE_LITE_PAID': 3,
        'DEEP_WIKI_MODEL_TYPE_PREMIUM': 4
    };
    return map[name] ?? 0;
}

function deepwikiSymbolTypeNumber(name: string): number {
    const map: Record<string, number> = {
        'DEEP_WIKI_SYMBOL_TYPE_UNSPECIFIED': 0,
        'DEEP_WIKI_SYMBOL_TYPE_FILE': 1,
        'DEEP_WIKI_SYMBOL_TYPE_MODULE': 2,
        'DEEP_WIKI_SYMBOL_TYPE_NAMESPACE': 3,
        'DEEP_WIKI_SYMBOL_TYPE_PACKAGE': 4,
        'DEEP_WIKI_SYMBOL_TYPE_CLASS': 5,
        'DEEP_WIKI_SYMBOL_TYPE_METHOD': 6,
        'DEEP_WIKI_SYMBOL_TYPE_PROPERTY': 7,
        'DEEP_WIKI_SYMBOL_TYPE_FIELD': 8,
        'DEEP_WIKI_SYMBOL_TYPE_CONSTRUCTOR': 9,
        'DEEP_WIKI_SYMBOL_TYPE_ENUM': 10,
        'DEEP_WIKI_SYMBOL_TYPE_INTERFACE': 11,
        'DEEP_WIKI_SYMBOL_TYPE_FUNCTION': 12,
        'DEEP_WIKI_SYMBOL_TYPE_VARIABLE': 13,
        'DEEP_WIKI_SYMBOL_TYPE_CONSTANT': 14,
        'DEEP_WIKI_SYMBOL_TYPE_STRING': 15,
        'DEEP_WIKI_SYMBOL_TYPE_NUMBER': 16,
        'DEEP_WIKI_SYMBOL_TYPE_BOOLEAN': 17,
        'DEEP_WIKI_SYMBOL_TYPE_ARRAY': 18,
        'DEEP_WIKI_SYMBOL_TYPE_OBJECT': 19,
        'DEEP_WIKI_SYMBOL_TYPE_KEY': 20,
        'DEEP_WIKI_SYMBOL_TYPE_NULL': 21,
        'DEEP_WIKI_SYMBOL_TYPE_ENUM_MEMBER': 22,
        'DEEP_WIKI_SYMBOL_TYPE_STRUCT': 23,
        'DEEP_WIKI_SYMBOL_TYPE_EVENT': 24,
        'DEEP_WIKI_SYMBOL_TYPE_OPERATOR': 25,
        'DEEP_WIKI_SYMBOL_TYPE_TYPE_PARAMETER': 26
    };
    return map[name] ?? 0;
}

function buildMetadataFromJson(meta: any): PBMetadata {
    return {
        ideName: String(meta?.ide_name ?? ''),
        extensionVersion: String(meta?.extension_version ?? ''),
        apiKey: String(meta?.api_key ?? ''),
        locale: String(meta?.locale ?? ''),
        osInfoJson: String(meta?.os_info_json ?? ''),
        ideVersion: String(meta?.ide_version ?? ''),
        hardwareInfoJson: String(meta?.hardware_info_json ?? ''),
        workspaceId: String(meta?.workspace_id ?? ''),
        extensionName: String(meta?.extension_name ?? ''),
        authToken: String(meta?.auth_token ?? ''),
        sessionId: String(meta?.session_id ?? ''),
        osEdition: String(meta?.os_edition ?? ''),
        machineId: ''
    };
}

function buildDeepwikiRequestBytesFromJson(jsonObj: any): Uint8Array {
    const message: PBGetDeepWikiRequest = {
        metadata: buildMetadataFromJson(jsonObj?.metadata ?? {}),
        requestType: deepwikiRequestTypeNumber(String(jsonObj?.request_type ?? 'DEEP_WIKI_REQUEST_TYPE_UNSPECIFIED')) as any,
        symbolName: String(jsonObj?.symbol_name ?? ''),
        symbolUri: String(jsonObj?.symbol_uri ?? ''),
        context: String(jsonObj?.context ?? ''),
        symbolType: deepwikiSymbolTypeNumber(String(jsonObj?.symbol_type ?? 'DEEP_WIKI_SYMBOL_TYPE_UNSPECIFIED')) as any,
        language: String(jsonObj?.language ?? ''),
        modelType: deepwikiModelTypeNumber(String(jsonObj?.model_type ?? 'DEEP_WIKI_MODEL_TYPE_UNSPECIFIED')) as any
    };
    const writer = new BinaryWriter();
    PBGetDeepWikiRequest.internalBinaryWrite(message, writer, {
        writeUnknownFields: false,
        writerFactory: () => new BinaryWriter()
    } as any);
    return writer.finish();
}

function parseDeepwikiResponses(data: Uint8Array): string {
	const channel = getOutputChannel();
	channel.appendLine('[DeepWiki] Raw response bytes length: ' + data.length);
	channel.appendLine('[DeepWiki] Raw response hex (first 4096): ' + Buffer.from(data).toString('hex').slice(0, 4096));
	channel.appendLine('[DeepWiki] Raw response base64 (first 4096): ' + Buffer.from(data).toString('base64').slice(0, 4096));
	const deltas: string[] = [];
	let offset = 0;
	let frameIndex = 0;
	while (offset + 5 <= data.length) {
		const flags = data[offset];
		offset += 1;
		const len =
			(data[offset] << 24) |
			(data[offset + 1] << 16) |
			(data[offset + 2] << 8) |
			data[offset + 3];
		offset += 4;
		if (len < 0 || offset + len > data.length) {
			break;
		}
		const frame = data.slice(offset, offset + len);
		offset += len;
		frameIndex += 1;
		channel.appendLine(`[DeepWiki] Frame #${frameIndex} flags=${flags} len=${len}`);
		channel.appendLine('[DeepWiki] Frame raw hex (first 512): ' + Buffer.from(frame).toString('hex').slice(0, 512));
    const compressed = (flags & 0x01) !== 0;
    let uncompressedBuf: Buffer;
    if (compressed) {
            try {
                    uncompressedBuf = zlib.gunzipSync(Buffer.from(frame));
            } catch {
                    uncompressedBuf = Buffer.from(frame);
            }
    } else {
            uncompressedBuf = Buffer.from(frame);
    }
		channel.appendLine(
			'[DeepWiki] Frame uncompressed hex (first 512): ' + uncompressedBuf.toString('hex').slice(0, 512)
		);

		// 尝试识别 JSON 错误帧（Connect end_stream error）
		const trimmed = uncompressedBuf.toString('utf8').trimStart();
		if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
			channel.appendLine('[DeepWiki] Frame JSON (pretty):');
			try {
				const obj = JSON.parse(trimmed);
				channel.appendLine(JSON.stringify(obj, null, 2));
			} catch {
				channel.appendLine(trimmed);
			}
			continue;
		}

		// 非 JSON：使用生成的 protobuf 解码 text_delta
		let text: string | undefined;
        try {
            const reader = new BinaryReader(uncompressedBuf);
            const msg = PBGetDeepWikiResponse.internalBinaryRead(reader, uncompressedBuf.length, {
                readUnknownField: false,
                readerFactory: (bytes: Uint8Array) => new BinaryReader(bytes)
            } as any);
            text = msg.response?.textDelta;
        } catch {
            text = undefined;
        }
		channel.appendLine('[DeepWiki] Frame text_delta: ' + (text ?? '<none>'));
		if (text) {
			deltas.push(text);
		}
	}
	return deltas.join('');
}

// 已移除手写的 wire 扫描解析，全部改用生成的解码器

export async function fetchDeepwikiArticle(params: DeepwikiContextParams): Promise<string> {
	const config = vscode.workspace.getConfiguration('context-code-text');
	const apiKey = config.get<string>('windsurfApiKey') ?? '';
	const authToken = config.get<string>('windsurfJwt') ?? '';
	if (!apiKey || !authToken) {
		throw new Error('缺少 Windsurf 登录信息，请先运行 “Context Code Text: Windsurf Login”。');
	}

	const sessionId = generateSessionId();
	const channel = getOutputChannel();
	channel.appendLine('[DeepWiki] Request symbol: ' + params.symbolName);
	channel.appendLine('[DeepWiki] Request URI: ' + params.symbolUri);

	// 结构化 JSON 视图，方便和 HAR/deepwiki.json 对比
	const modelType: DeepwikiModelType = 1;
	const requestJson = {
		metadata: {
			ide_name: 'windsurf',
			extension_version: '1.48.2',
			api_key: apiKey,
			locale: vscode.env.language || 'en',
			os_info_json: buildOsInfoJson(),
			ide_version: '1.12.27',
			hardware_info_json: buildHardwareInfoJson(),
			workspace_id: ensureWorkspaceId(),
			extension_name: 'windsurf',
			auth_token: authToken,
			session_id: sessionId,
			os_edition: 'Pro'
		},
		request_type: 'DEEP_WIKI_REQUEST_TYPE_ARTICLE',
		symbol_name: params.symbolName,
		symbol_uri: params.symbolUri,
		context: buildContextText(params),
		symbol_type: deepwikiSymbolTypeName(params.symbolType),
		language: '中文（中国）',
		model_type: deepwikiModelTypeName(modelType)
	};
	channel.appendLine('[DeepWiki] Request JSON:');
	channel.appendLine(JSON.stringify(requestJson, null, 2));

	// Build request bytes from the JSON to mirror Python (JSON -> proto bytes)
	const requestBytes = buildDeepwikiRequestBytesFromJson(requestJson);
	channel.appendLine('[DeepWiki] Request bytes length: ' + requestBytes.length);
	channel.appendLine('[DeepWiki] Request hex (first 4096): ' + Buffer.from(requestBytes).toString('hex').slice(0, 4096));
	channel.appendLine(
		'[DeepWiki] Request base64 (first 4096): ' + Buffer.from(requestBytes).toString('base64').slice(0, 4096)
	);
	const gzipped = zlib.gzipSync(requestBytes);

	const frame = Buffer.alloc(1 + 4 + gzipped.length);
	frame.writeUInt8(0x01, 0);
	frame.writeUInt32BE(gzipped.length, 1);
	gzipped.copy(frame, 5);

	const response = await fetch('https://server.self-serve.windsurf.com/exa.api_server_pb.ApiServerService/GetDeepWiki', {
		method: 'POST',
		headers: {
			'User-Agent': 'connect-go/1.18.1 (go1.24.6 X:nocoverageredesign,synctest)',
			'content-type': 'application/connect+proto',
			'connect-protocol-version': '1',
			'Accept-Encoding': 'identity',
			'connect-content-encoding': 'gzip',
			'connect-accept-encoding': 'gzip',
			'Accept': '*/*'
		} as Record<string, string>,
		body: frame
	});

	if (!response.ok) {
		throw new Error(`DeepWiki 请求失败: ${response.status} ${response.statusText}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	const bytes = new Uint8Array(arrayBuffer);
	const text = parseDeepwikiResponses(bytes);
	if (!text) {
		throw new Error('DeepWiki 返回为空，未解析到任何内容。');
	}
	return text;
}






