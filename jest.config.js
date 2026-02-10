module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true,
  collectCoverageFrom: [
    'controllers/**/*.js',
    '!controllers/**/index.js'
  ],
  coverageDirectory: 'coverage',
  testTimeout: 10000
};
