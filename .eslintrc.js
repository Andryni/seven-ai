// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: ['expo'],
  ignorePatterns: ['/dist/*', '/node_modules/*', '/.expo/*'],
  overrides: [
    {
      files: ['jest.setup.js', '__tests__/**/*.ts', '__tests__/**/*.tsx'],
      globals: { jest: 'readonly' },
    },
  ],
  rules: {
    // Project uses Expo's managed tooling; allow require() for optional
    // dynamically-loaded native modules (speech recognition, expo-av).
    '@typescript-eslint/no-var-requires': 'off',
    'no-console': 'off',
  },
};
