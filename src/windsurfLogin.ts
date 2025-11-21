import * as vscode from 'vscode';
import { getOutputChannel } from './outputChannel';

type RegisterUserResult = {
	apiKey: string;
	baseUrl: string;
	displayName?: string;
};

async function promptRegistrationCode(): Promise<string | undefined> {
	const input = await vscode.window.showInputBox({
		title: 'Windsurf Registration',
		placeHolder: '输入 registration_code，不用带前面的 +',
		prompt: '粘贴 Windsurf 注册码，例如 HdVkH4alCZrgBFOzsaEHXND3d3eC52chn_4znbPjgn4',
		ignoreFocusOut: true
	});
	if (!input) {
		return undefined;
	}
	return input.trim();
}

function encodeVarint(value: number): number[] {
	const bytes: number[] = [];
	let v = value >>> 0;
	while (v >= 0x80) {
		bytes.push((v & 0x7f) | 0x80);
		v >>>= 7;
	}
	bytes.push(v);
	return bytes;
}

function encodeStringField(fieldNumber: number, value: string): Uint8Array {
	const tag = (fieldNumber << 3) | 2;
	const valueBytes = Buffer.from(value, 'utf8');
	const lengthBytes = encodeVarint(valueBytes.length);
	return Uint8Array.from([tag, ...lengthBytes, ...Array.from(valueBytes)]);
}

function decodeFirstStringField(buf: Uint8Array): string | undefined {
	let offset = 0;
	while (offset < buf.length) {
		const key = buf[offset++];
		const fieldNumber = key >> 3;
		const wireType = key & 0x07;
		if (wireType !== 2) {
			return undefined;
		}
		let length = 0;
		let shift = 0;
		while (true) {
			if (offset >= buf.length) {
				return undefined;
			}
			const b = buf[offset++];
			length |= (b & 0x7f) << shift;
			if ((b & 0x80) === 0) {
				break;
			}
			shift += 7;
		}
		if (offset + length > buf.length) {
			return undefined;
		}
		const valueBytes = buf.slice(offset, offset + length);
		offset += length;
		if (fieldNumber === 1) {
			return Buffer.from(valueBytes).toString('utf8');
		}
	}
	return undefined;
}

function decodeStringFields(buf: Uint8Array): Record<number, string> {
	const out: Record<number, string> = {};
	let offset = 0;
	while (offset < buf.length) {
		const key = buf[offset++];
		const fieldNumber = key >> 3;
		const wireType = key & 0x07;
		if (wireType !== 2) {
			break;
		}
		let length = 0;
		let shift = 0;
		while (true) {
			if (offset >= buf.length) {
				return out;
			}
			const b = buf[offset++];
			length |= (b & 0x7f) << shift;
			if ((b & 0x80) === 0) {
				break;
			}
			shift += 7;
		}
		if (offset + length > buf.length) {
			return out;
		}
		const valueBytes = buf.slice(offset, offset + length);
		offset += length;
		out[fieldNumber] = Buffer.from(valueBytes).toString('utf8');
	}
	return out;
}

function buildRegisterUserBody(regCodeWithoutPlus: string): Uint8Array {
	// Wire format 和 HAR 一致：原始 body 在 Raw 视图里就是 "\n+<registration_code>"
	// 因此这里直接按该文本构造字节序列，而不再自己编码 length 前缀。
	const raw = `\n+${regCodeWithoutPlus}`;
	return new Uint8Array(Buffer.from(raw, 'utf8'));
}

async function callRegisterUser(regCodeWithoutPlus: string): Promise<RegisterUserResult> {
	const url = 'https://register.windsurf.com/exa.seat_management_pb.SeatManagementService/RegisterUser';
	const body = buildRegisterUserBody(regCodeWithoutPlus);
	const channel = getOutputChannel();
	channel.appendLine('[WindsurfLogin] RegisterUser body hex: ' + Buffer.from(body).toString());
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/proto',
			'connect-protocol-version': '1',
			'accept-encoding': 'gzip,br',
			'user-agent': 'connect-es/1.5.0',
			'Connection': 'close'
		},
		body
	});
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		console.error('[WindsurfLogin][RegisterUser] HTTP error', {
			url,
			status: response.status,
			statusText: response.statusText,
			body: text
		});
		throw new Error(`RegisterUser failed: ${response.status} ${response.statusText}`);
	}
	const arrayBuf = await response.arrayBuffer();
	const buf = new Uint8Array(arrayBuf);
	const fields = decodeStringFields(buf);
	const apiKey = fields[1];
	const displayName = fields[2];
	const baseUrl = fields[3] ?? 'https://server.self-serve.windsurf.com';
	if (!apiKey) {
		throw new Error('RegisterUser response missing api_key');
	}
	return { apiKey, baseUrl, displayName };
}

function buildClientInfo(apiKey: string): Uint8Array {
	const parts: Uint8Array[] = [];
	parts.push(encodeStringField(1, 'windsurf'));
	parts.push(encodeStringField(2, '1.48.2'));
	parts.push(encodeStringField(3, apiKey));
	const locale = vscode.env.language || 'en';
	parts.push(encodeStringField(4, locale));
	// 补全为 HAR 中观察到的 ClientInfo 结构
	parts.push(encodeStringField(7, '1.12.27'));
	parts.push(encodeStringField(10, '72a31019-8f78-4793-8ed2-4f1596906abc'));
	parts.push(encodeStringField(17, 'd:\\\\Program Files\\\\Windsurf\\\\resources\\\\app\\\\extensions\\\\windsurf'));
	parts.push(encodeStringField(24, '7c6635b9771a050ed7cd5c16011affb2'));
	parts.push(encodeStringField(26, 'Unset'));
	let length = 0;
	for (const p of parts) {
		length += p.length;
	}
	const flattened = new Uint8Array(length);
	let offset = 0;
	for (const p of parts) {
		flattened.set(p, offset);
		offset += p.length;
	}
	return flattened;
}

function buildGetUserJwtBody(apiKey: string): Uint8Array {
	const clientInfo = buildClientInfo(apiKey);
	const tag = (1 << 3) | 2;
	const lengthBytes = encodeVarint(clientInfo.length);
	return Uint8Array.from([tag, ...lengthBytes, ...Array.from(clientInfo)]);
}

async function callGetUserJwt(baseUrl: string, apiKey: string): Promise<string> {
	const url = `${baseUrl.replace(/\/$/, '')}/exa.auth_pb.AuthService/GetUserJwt`;
	const body = buildGetUserJwtBody(apiKey);
	const channel = getOutputChannel();
	channel.appendLine('[WindsurfLogin] GetUserJwt body hex: ' + Buffer.from(body).toString('hex'));
	channel.appendLine('[WindsurfLogin] GetUserJwt body base64: ' + Buffer.from(body).toString('base64'));
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/proto',
			'connect-protocol-version': '1',
			'accept-encoding': 'gzip',
			'connect-timeout-ms': '30000',
			'user-agent': 'connect-go/1.18.1 (go1.24.6 X:nocoverageredesign,synctest)'
		},
		body
	});
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		console.error('[WindsurfLogin][GetUserJwt] HTTP error', {
			url,
			status: response.status,
			statusText: response.statusText,
			body: text
		});
		throw new Error(`GetUserJwt failed: ${response.status} ${response.statusText}`);
	}
	const arrayBuf = await response.arrayBuffer();
	const buf = new Uint8Array(arrayBuf);
	const jwt = decodeFirstStringField(buf);
	if (!jwt) {
		throw new Error('GetUserJwt response missing JWT');
	}
	return jwt;
}

export async function runWindsurfLogin(): Promise<void> {
	const url = 'https://windsurf.com/editor/show-auth-token?response_type=token&redirect_uri=windsurf%3A%2F%2Fcodeium.windsurf&prompt=login&redirect_parameters_type=fragment&workflow=onboarding&authType=signin&from=redirect';
	vscode.env.openExternal(vscode.Uri.parse(url));
	const reg = await promptRegistrationCode();
	if (!reg) {
		return;
	}
	try {
		const registering = vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Windsurf 登录中…',
				cancellable: false
			},
			async () => {
				const regResult = await callRegisterUser(reg);
				const jwt = await callGetUserJwt(regResult.baseUrl, regResult.apiKey);
				const config = vscode.workspace.getConfiguration('context-code-text');
				await config.update('windsurfApiKey', regResult.apiKey, vscode.ConfigurationTarget.Global);
				await config.update('windsurfJwt', jwt, vscode.ConfigurationTarget.Global);
				const name = regResult.displayName ?? '用户';
				vscode.window.showInformationMessage(`Windsurf 登录成功，欢迎 ${name}`);
			}
		);
		await registering;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const which =
			message.includes('RegisterUser') ? '（RegisterUser）' : message.includes('GetUserJwt') ? '（GetUserJwt）' : '';
		vscode.window.showErrorMessage(`Windsurf 登录失败${which}: ${message}`);
	}
}
