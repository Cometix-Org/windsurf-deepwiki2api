import * as vscode from 'vscode';
import * as os from 'os';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { getGlobalState } from './globalState';
import { BinaryWriter, BinaryReader } from '@protobuf-ts/runtime';
import { GetDeepWikiRequest as PBGetDeepWikiRequest, GetDeepWikiResponse as PBGetDeepWikiResponse, Metadata as PBMetadata } from './generated/deepwiki_full';

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
	const state = getGlobalState();
	let id = state.get<string>('workspaceId');
	if (!id) {
		const buf = crypto.randomBytes(16);
		buf[6] = (buf[6] & 0x0f) | 0x40;
		buf[8] = (buf[8] & 0x3f) | 0x80;
		const hex = buf.toString('hex');
		id = `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
		void state.update('workspaceId', id);
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
	const articleParts: string[] = [];
	const followupParts: string[] = [];
	let isArticleDoneSeen = false;
	let offset = 0;
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

		// 尝试识别 JSON 错误帧（Connect end_stream error）
		const trimmed = uncompressedBuf.toString('utf8').trimStart();
		if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
			continue;
		}

		// 非 JSON：使用生成的 protobuf 解码 text_delta
		try {
			const reader = new BinaryReader(uncompressedBuf);
			const msg = PBGetDeepWikiResponse.internalBinaryRead(reader, uncompressedBuf.length, {
				readUnknownField: false,
				readerFactory: (bytes: Uint8Array) => new BinaryReader(bytes)
			} as any);
			const text = msg.response?.textDelta ?? '';
			const convId = msg.response?.conversationId ?? '';
			const isFollowup = /-followup$/i.test(convId);
			const followupQuestions = (msg as any).followupQuestions as string | undefined;
			if (typeof msg.isArticleDone === 'boolean' && msg.isArticleDone) {
				isArticleDoneSeen = true;
			}
			if (text) {
				if (isFollowup) {
					followupParts.push(text);
				} else {
					articleParts.push(text);
				}
			}
			if (followupQuestions && followupQuestions.trim()) {
				followupParts.push(followupQuestions);
			}
		} catch {
			// ignore undecodable frames
		}
	}
	const article = articleParts.join('');
	const followupsRaw = followupParts.join('');
	const items = followupsRaw.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const it of items) { if (!seen.has(it)) { seen.add(it); unique.push(it); } }
	if (unique.length === 0) {
		return article;
	}
	const section = ['','---','','后续提问', ...unique.map(q => `- ${q}`)].join('\n');
	return article + '\n' + section;
}

// 已移除手写的 wire 扫描解析，全部改用生成的解码器

export async function fetchDeepwikiArticle(params: DeepwikiContextParams): Promise<string> {
	const config = vscode.workspace.getConfiguration('context-code-text');
	const apiKey = config.get<string>('windsurfApiKey') ?? '';
	const authToken = config.get<string>('windsurfJwt') ?? '';
	if (!apiKey || !authToken) {
		throw new Error('缺少 Windsurf 登录信息，请先运行 "Context Code Text: Windsurf Login"。');
	}

	const sessionId = generateSessionId();

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

	// Build request bytes from the JSON to mirror Python (JSON -> proto bytes)
	const requestBytes = buildDeepwikiRequestBytesFromJson(requestJson);
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

export type DeepwikiStreamMessage =
    | { type: 'article'; text: string }
    | { type: 'followup'; text: string }
    | { type: 'done' };

async function buildDeepwikiRequestFrame(params: DeepwikiContextParams): Promise<Buffer> {
    const config = vscode.workspace.getConfiguration('context-code-text');
    const apiKey = config.get<string>('windsurfApiKey') ?? '';
    const authToken = config.get<string>('windsurfJwt') ?? '';
    if (!apiKey || !authToken) {
        throw new Error('缺少 Windsurf 登录信息，请先运行 "Context Code Text: Windsurf Login"。');
    }

    const sessionId = generateSessionId();

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

    const requestBytes = buildDeepwikiRequestBytesFromJson(requestJson);
    const gzipped = zlib.gzipSync(requestBytes);

    const frame = Buffer.alloc(1 + 4 + gzipped.length);
    frame.writeUInt8(0x01, 0);
    frame.writeUInt32BE(gzipped.length, 1);
    gzipped.copy(frame, 5);
    return frame;
}

async function connectAndFetch(params: DeepwikiContextParams) {
    const frame = await buildDeepwikiRequestFrame(params);
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
    return response as any;
}

export async function streamDeepwikiArticle(
    params: DeepwikiContextParams,
    onMessage: (m: DeepwikiStreamMessage) => void
): Promise<void> {
    const response = await connectAndFetch(params);

    const decodeFrame = (flags: number, payload: Uint8Array) => {
        const compressed = (flags & 0x01) !== 0;
        let uncompressed: Buffer;
        if (compressed) {
            try {
                uncompressed = zlib.gunzipSync(Buffer.from(payload));
            } catch {
                uncompressed = Buffer.from(payload);
            }
        } else {
            uncompressed = Buffer.from(payload);
        }

        const trimmed = uncompressed.toString('utf8').trimStart();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            return;
        }

        try {
            const reader = new BinaryReader(uncompressed);
            const msg = PBGetDeepWikiResponse.internalBinaryRead(reader, uncompressed.length, {
                readUnknownField: false,
                readerFactory: (bytes: Uint8Array) => new BinaryReader(bytes)
            } as any);
            const text = msg.response?.textDelta ?? '';
            const convId = msg.response?.conversationId ?? '';
            const isFollowup = /-followup$/i.test(convId);
            const followupQuestions = (msg as any).followupQuestions as string | undefined;
            if (typeof msg.isArticleDone === 'boolean' && msg.isArticleDone) {
                onMessage({ type: 'done' });
            }
            if (text) {
                onMessage({ type: isFollowup ? 'followup' : 'article', text });
            }
            if (followupQuestions && followupQuestions.trim()) {
                onMessage({ type: 'followup', text: followupQuestions });
            }
        } catch {
            // ignore undecodable frames
        }
    };

    const reader: any = response.body?.getReader ? response.body.getReader() : null;
    let buffer = Buffer.alloc(0);
    const processBuffer = () => {
        while (buffer.length >= 5) {
            const flags = buffer[0];
            const len = buffer.readUInt32BE(1);
            if (len < 0 || buffer.length < 5 + len) {break;}
            const payload = buffer.subarray(5, 5 + len);
            buffer = buffer.subarray(5 + len);
            decodeFrame(flags, payload);
        }
    };

    if (reader && typeof reader.read === 'function') {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {break;}
            const chunk = Buffer.from(value);
            buffer = Buffer.concat([buffer, chunk]);
            processBuffer();
        }
        processBuffer();
        return;
    }

    const nodeStream: any = response.body;
    if (!nodeStream || typeof nodeStream[Symbol.asyncIterator] !== 'function') {
        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(new Uint8Array(arrayBuffer));
        processBuffer();
        return;
    }
    for await (const chunk of nodeStream as AsyncIterable<Buffer>) {
        buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
        processBuffer();
    }
    processBuffer();
}
