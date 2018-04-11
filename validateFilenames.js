module.exports = {
  rules: [
    {
      validation: 'camelCase',
      patterns: ['*/**'],
    },
    {
      validation: 'PascalCase',
      patterns: ['src/reporters/*.ts'],
    },
    {
      validation: 'ignore',
      patterns: [
        '*/**/typings/*',
        '__tests__/**/*',
        'docker-compose.yml',
        '**/LICENSE.md',
        '**/README.md',
      ],
    },
  ],
};
