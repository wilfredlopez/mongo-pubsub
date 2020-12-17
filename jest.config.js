const { defaults: tsjPreset } = require('ts-jest/presets')

module.exports = {
  transform: tsjPreset.transform,
  rootDir: './tests',
  roots: ['<rootDir>'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  preset: '@shelf/jest-mongodb',
  //   testEnvironment: 'node',
  clearMocks: true,
  coverageDirectory: 'coverage',
  testMatch: ['<rootDir>/**/*.test.(ts|tsx)'],
  setupFiles: ['<rootDir>/setupTests.ts'],
}
