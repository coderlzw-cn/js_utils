/**
 * 支持的压缩包扩展名。
 */
export const ARCHIVE_EXTENSIONS = [".zip", ".rar", ".7z", ".tar", ".tar.gz", ".tgz", ".gz", ".gzip", ".tar.bz2", ".tbz", ".tbz2", ".bz2", ".tar.xz", ".txz", ".xz"] as const;

/**
 * 压缩包扩展名类型。
 */
export type ArchiveExtension = (typeof ARCHIVE_EXTENSIONS)[number];

/**
 * 判断文件名或文件路径是否为压缩包。
 *
 * @param filename 文件名或文件路径
 */
export function isArchiveFile(filename: string): boolean {
  if (!filename || /[\\/]$/.test(filename)) {
    return false;
  }

  const basename = filename.split(/[\\/]/).pop()?.toLowerCase();

  if (!basename) {
    return false;
  }

  return ARCHIVE_EXTENSIONS.some((extension) => basename.endsWith(extension));
}
