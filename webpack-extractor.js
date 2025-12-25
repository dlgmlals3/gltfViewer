const fs = require('fs');
const path = require('path');

// 사용법: node webpack-extractor.js <bundle.js> <output-dir>
const bundleFile = process.argv[2];
const outputDir = process.argv[3] || './extracted';

if (!bundleFile) {
  console.error('Usage: node webpack-extractor.js <bundle.js> [output-dir]');
  process.exit(1);
}

// 번들 파일 읽기
const bundleContent = fs.readFileSync(bundleFile, 'utf-8');

// 모듈 배열 추출 (정규식으로 찾기)
const moduleArrayMatch = bundleContent.match(/\]\s*\(\[\s*\n([\s\S]*?)\n\s*\/\*\*\*\*\*\*\/\s*\]\)/);

if (!moduleArrayMatch) {
  console.error('Could not find webpack module array');
  process.exit(1);
}

// 각 모듈 분리
const modulesText = moduleArrayMatch[1];
const moduleRegex = /\/\*\s*(\d+)\s*\*\/\s*\/\*\*\*\/\s*\(function\(module,\s*__webpack_exports__,\s*__webpack_require__\)\s*\{([\s\S]*?)\n\s*\/\*\*\*\/\s*\}\)/g;

const modules = [];
let match;

while ((match = moduleRegex.exec(modulesText)) !== null) {
  const moduleId = parseInt(match[1]);
  const moduleCode = match[2];
  modules.push({ id: moduleId, code: moduleCode });
}

console.log(`Found ${modules.length} modules`);

// 출력 디렉토리 생성
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 각 모듈을 파일로 저장
modules.forEach(({ id, code }) => {
  // 파일명 추론 시도
  let filename = `module-${id}.js`;
  
  // @module 주석에서 이름 찾기
  const moduleNameMatch = code.match(/@module\s+(\w+)/);
  if (moduleNameMatch) {
    const moduleName = moduleNameMatch[1];
    filename = moduleName === 'glMatrix' ? 'common.js' : `${moduleName}.js`;
  }
  
  // import 주석에서 파일명 찾기
  const importMatch = code.match(/__WEBPACK_IMPORTED_MODULE_\d+__([^_]+)__/);
  if (importMatch && filename.startsWith('module-')) {
    filename = `${importMatch[1]}.js`;
  }
  
  // shader 파일 감지
  if (code.includes('export default') && code.includes('precision')) {
    if (code.includes('gl_Position')) {
      filename = `shader-${id}.vert.glsl`;
    } else if (code.includes('gl_FragColor') || code.includes('fragColor')) {
      filename = `shader-${id}.frag.glsl`;
    }
  }
  
  // 원본 코드 그대로 저장 (주석 포함)
  const outputPath = path.join(outputDir, filename);
  
  // webpack 보일러플레이트 제거하고 깔끔하게 정리
  let cleanCode = code
    .replace(/^"use strict";\s*\n/, '')
    .replace(/Object\.defineProperty\(__webpack_exports__,\s*"__esModule",\s*\{\s*value:\s*true\s*\}\);?\s*\n/g, '')
    .replace(/\/\* harmony export \(binding\) \*\/[^\n]*\n/g, '')
    .replace(/\/\* harmony export \(immutable\) \*\/[^\n]*\n/g, '')
    .replace(/\/\* harmony import \*\/[^\n]*\n/g, '')
    .replace(/__webpack_require__\.d\([^)]+\);\s*\n/g, '')
    .replace(/__webpack_require__\.r\(__webpack_exports__\);?\s*\n/g, '')
    .trim();
  
  fs.writeFileSync(outputPath, cleanCode, 'utf-8');
  console.log(`Extracted module ${id} -> ${filename}`);
});

console.log(`\nExtraction complete! Files saved to: ${outputDir}/`);
console.log('\nNext steps:');
console.log('1. Review extracted files');
console.log('2. Convert __webpack_require__(X) to ES6 imports');
console.log('3. Convert __webpack_exports__ to ES6 exports');