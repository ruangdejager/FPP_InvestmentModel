import { pathToFileURL } from 'node:url';

/**
 * True when this module is the entry point node was given.
 *
 * Comparing file URLs rather than raw paths keeps this working on Windows, where
 * argv carries backslashes and import.meta.url does not.
 */
export function isMainModule(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return importMetaUrl === pathToFileURL(entry).href;
}
