/**
 * 代码块首行路径解析工具
 * 从扩展端 codeTokenizer.ts 迁移而来
 */

export interface CodeBlockHeaderInfo {
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  remainingCode: string;
}

/**
 * 解析代码块第一行的文件路径和行号
 * 支持格式：
 * - "98:101:/path/to/file.ts" (startLine:endLine:filePath)
 * - "98:/path/to/file.ts" (line:filePath)
 * - "/path/to/file.ts" (仅路径)
 * 
 * @returns 解析结果，包含文件路径、起始行、结束行，以及剩余代码
 */
export function parseCodeBlockHeader(code: string): CodeBlockHeaderInfo {
  const lines = code.split('\n');
  if (lines.length === 0) {
    return { filePath: null, startLine: null, endLine: null, remainingCode: code };
  }
  
  const firstLine = lines[0].trim();
  
  // 跳过注释行
  if (firstLine.startsWith('//') || firstLine.startsWith('#')) {
    return { filePath: null, startLine: null, endLine: null, remainingCode: code };
  }
  
  // 尝试匹配 startLine:endLine:/path 格式
  // 例如: 98:101:/e:/AiCreatedProjects/xxx/file.ts
  const fullMatch = firstLine.match(/^(\d+):(\d+):(.+)$/);
  if (fullMatch) {
    const startLine = parseInt(fullMatch[1], 10);
    const endLine = parseInt(fullMatch[2], 10);
    const filePath = fullMatch[3].trim();
    // 验证路径看起来像文件路径
    if (filePath.includes('/') || filePath.includes('\\')) {
      return {
        filePath,
        startLine,
        endLine,
        remainingCode: lines.slice(1).join('\n')
      };
    }
  }
  
  // 尝试匹配 line:/path 格式
  // 例如: 98:/e:/AiCreatedProjects/xxx/file.ts
  const linePathMatch = firstLine.match(/^(\d+):(.+)$/);
  if (linePathMatch) {
    const line = parseInt(linePathMatch[1], 10);
    const filePath = linePathMatch[2].trim();
    if (filePath.includes('/') || filePath.includes('\\')) {
      return {
        filePath,
        startLine: line,
        endLine: null,
        remainingCode: lines.slice(1).join('\n')
      };
    }
  }
  
  // 尝试匹配纯路径格式（以 / 或盘符开头）
  // 例如: /path/to/file.ts 或 e:/path/to/file.ts
  const pathMatch = firstLine.match(/^([a-zA-Z]:)?[\/\\](?![\/\\]).+\.\w+$/);
  if (pathMatch) {
    return {
      filePath: firstLine,
      startLine: null,
      endLine: null,
      remainingCode: lines.slice(1).join('\n')
    };
  }
  
  // 没有匹配到任何格式
  return { filePath: null, startLine: null, endLine: null, remainingCode: code };
}

/**
 * 从文件路径中提取文件名
 */
export function getFileName(filePath: string): string {
  return filePath.split(/[\/\\]/).pop() || filePath;
}

/**
 * 根据文件路径获取文件扩展名
 */
export function getFileExtension(filePath: string): string {
  const fileName = getFileName(filePath);
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return ext;
}

/**
 * 构建行号显示字符串
 */
export function formatLineInfo(startLine: number | null, endLine: number | null): string {
  if (startLine !== null && endLine !== null) {
    return `L${startLine}-${endLine}`;
  } else if (startLine !== null) {
    return `L${startLine}`;
  }
  return '';
}


