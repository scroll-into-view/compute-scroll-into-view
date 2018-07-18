module.exports = {
  preset: 'jest-puppeteer',
  testRegex: './*\\.test\\.js$',
  reporters: [
    'default',
    ['jest-junit', { output: 'reports/jest/results.xml' }],
  ],
}
