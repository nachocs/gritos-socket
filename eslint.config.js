import js from '@eslint/js';
import globals from 'globals';

// Replaces the old .eslintrc. That file carried a lot of frontend cruft this
// project never had — jsx-quotes, browser env, FB/componentHandler globals,
// the babel plugin, and an ecmaFeatures block that modern eslint ignores
// entirely. What remains is the same style contract the source already follows.
export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 0,
      'new-cap': 0,
      'no-underscore-dangle': 0,
      'accessor-pairs': [2, { getWithoutSet: false }],
      'no-var': 2,
      'prefer-const': 2,
      'object-shorthand': [2, 'always'],
      'constructor-super': 2,
      'no-this-before-super': 2,
      'no-unused-vars': [2, { vars: 'all', args: 'after-used' }],
      'no-undef': 2,
    },
  },
];
