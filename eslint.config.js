import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // O app mobile (mobile/) roda em React Native e tem seu próprio toolchain:
  // este config assume globais de navegador e regras do Vite, que não se aplicam lá.
  // shared/ fica de fora do ignore de propósito — é código que o app web usa.
  globalIgnores(['dist', 'mobile']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
