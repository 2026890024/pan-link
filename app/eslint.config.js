import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.wrangler'] },

  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // 严格规则
      'radix': 'error',                              // parseInt 必须传第二个参数
      'curly': ['error', 'all'],                      // 所有 if/for/while 必须用大括号
      'eqeqeq': ['error', 'always'],                  // 必须用 === 而不是 ==
      'no-console': 'off',    // 开发阶段允许 console
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-template-curly-in-string': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-throw-literal': 'error',
      'require-await': 'warn',
      'no-useless-catch': 'off',  // 允许空 catch 作为优雅降级

      // TypeScript
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/array-type': ['warn', { default: 'generic' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  }
)
