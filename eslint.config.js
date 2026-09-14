// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],

      // Reglas que atrapan bugs reales, no estilo (convención adoptada de
      // xlearn-arch, ver memoria feedback_nullish_and_promises.md). Se
      // activan puntualmente sobre el preset base en vez de sumar
      // tseslint.configs.recommendedTypeChecked entero: ese preset trae
      // también la familia no-unsafe-*, que en este proyecto dispararía en
      // cada `row: any` de mapeo de respuestas de Supabase (ver
      // order/query.service.ts) sin atrapar ningún bug real.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // Dos excepciones legítimas ya documentadas en memoria (string vacío
      // -> null, NaN de Number()/inputs): se marcan con
      // eslint-disable-next-line puntual en vez de bajar la regla a 'warn'.
      '@typescript-eslint/prefer-nullish-coalescing': 'error',

      // Convención ya usada en el proyecto (ej. onBackdropClick(_e) en
      // confirm-delete-modal): un parámetro con prefijo `_` es
      // deliberadamente ignorado (la firma la exige un handler de evento,
      // no el cuerpo de la función). Sin esta opción el preset recomendado
      // marca cualquiera de esos como no usado.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
