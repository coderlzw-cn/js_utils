export interface PathObject {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
}

/**
 * 前后端通用的 path.parse 实现
 * @param pathString 路径字符串，如 '/home/user/dir/file.txt' 或 'C:\\path\\file.txt'
 */
export function parsePath(pathString: string): PathObject {
  if (typeof pathString !== "string") {
    throw new TypeError(`Path must be a string. Received ${typeof pathString}`);
  }

  // 1. 处理空字符串
  if (pathString.length === 0) {
    return { root: "", dir: "", base: "", ext: "", name: "" };
  }

  // 统一路径分隔符（将 Windows 的 \ 转换为 /）
  // 注意：这样既能兼容 Windows 路径，也能兼容 Unix/Linux 路径
  const isWindowsAbsolute = /^[a-zA-Z]:[/\\]/.test(pathString);
  let normalizedPath = pathString.replace(/\\/g, "/");

  // 2. 提取 root（根路径）
  let root = "";
  if (isWindowsAbsolute) {
    // Windows 盘符根，如 'C:/'
    root = normalizedPath.slice(0, 3);
  } else if (normalizedPath.startsWith("/")) {
    // Unix 绝对路径根 '/'
    root = "/";
  }

  // 3. 提取 base（文件名+后缀）和 dir（父目录）
  // 移除末尾多余的分隔符（如 'a/b/' -> 'a/b'）
  const cleanPath = normalizedPath.length > root.length && normalizedPath.endsWith("/") ? normalizedPath.slice(0, -1) : normalizedPath;

  const lastSlashIndex = cleanPath.lastIndexOf("/");

  let dir = "";
  let base = "";

  if (lastSlashIndex === -1) {
    // 相对路径且无斜杠，如 'file.txt'
    base = cleanPath;
    dir = "";
  } else if (lastSlashIndex < root.length) {
    // 父目录恰好是根路径，如 '/file.txt' 或 'C:/file.txt'
    dir = root.endsWith("/") && root.length > 1 ? root.slice(0, -1) : root;
    base = cleanPath.slice(lastSlashIndex + 1);
  } else {
    // 普通路径，如 '/a/b/file.txt'
    dir = cleanPath.slice(0, lastSlashIndex);
    base = cleanPath.slice(lastSlashIndex + 1);
  }

  // 4. 从 base 中提取 name 和 ext
  let name = base;
  let ext = "";

  // 排除隐藏文件（如 '.gitignore'、'.'、'..'）导致的后缀误判
  const lastDotIndex = base.lastIndexOf(".");
  if (lastDotIndex > 0 && lastDotIndex !== base.length - 1) {
    name = base.slice(0, lastDotIndex);
    ext = base.slice(lastDotIndex);
  }

  return { root, dir, base, ext, name };
}
