module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  setupFiles: ['<rootDir>/../test/setup.ts'],
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@common/(.*)$': '<rootDir>/common/$1',
    '^@config/(.*)$': '<rootDir>/config/$1',
    '^@database/(.*)$': '<rootDir>/database/$1',
    '^@infrastructure/(.*)$': '<rootDir>/infrastructure/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
    '^@jobs/(.*)$': '<rootDir>/jobs/$1',
  },
};
