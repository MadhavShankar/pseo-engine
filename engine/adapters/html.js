import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
export function write(slug, html, outputDir = './output') {
  const dir = join(outputDir, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
}
