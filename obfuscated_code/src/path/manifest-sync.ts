import type { PathRenameEntry } from './pages-json-sync.js';
import { transformResourcePath } from './pages-json-sync.js';

const IMAGE_PATH_EXTENSIONS = /\.(?:png|jpe?g|webp|gif|ico|svg)$/i;
const REMOTE_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

function isManifestImagePath(value: string): boolean {
  if (REMOTE_SCHEME.test(value)) return false;
  return IMAGE_PATH_EXTENSIONS.test(value);
}

/**
 * manifest.json 仅同步图片/静态资源路径（icons、splashScreens 等），
 * 与 clone 阶段 static/、package/ 等目录映射一致；不改动 appid、权限文案等字段。
 */
export function syncManifestJsonContent(content: string, renameLog: PathRenameEntry[]): string {
  return content.replace(/:\s*"([^"]+)"/g, (match, value: string) => {
    if (!isManifestImagePath(value)) return match;
    const transformed = transformResourcePath(value, renameLog);
    if (transformed === value) return match;
    return `: "${transformed}"`;
  });
}
