const { translateToEnglish } = require('../lib/translate');

const testCases = [
  '电子配件',
  '服装',
  '机械设备',
  '普通货物',
  '五金工具 (Hardware)',
  'Electronic Components',
  'N/A',
];

console.log('Testing Commodity English Translation:');
testCases.forEach((tc) => {
  const result = translateToEnglish(tc);
  console.log(`Original: "${tc}" -> Translated: "${result}"`);
});

const isPassed = testCases.every((tc) => {
  const res = translateToEnglish(tc);
  return typeof res === 'string' && res.length > 0 && !/[\u4e00-\u9fa5]/.test(res);
});

if (isPassed) {
  console.log('PASSED: All commodity names strictly translated into clean English ONLY!');
} else {
  console.error('FAILED: Chinese characters remained in translated commodity output!');
  process.exit(1);
}
