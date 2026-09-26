// Vite's own react-ts template preset, not @wagonwise/config/eslint — that config's TS rules
// assume module: NodeNext (enforced repo-wide for apps/core and apps/driver-bff), which fights
// Vite's bundler-style resolution, same reasoning driver-app's eslint.config.js gives for using
// eslint-config-expo instead: the well-understood official preset for the actual bundler in use
// beats forcing a Node-flavoured shared config onto a browser app.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config([
  { ignores: ['dist/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactRefresh.configs.vite],
    // eslint-plugin-react-hooks@7's own `configs.recommended-latest` is still in the legacy
    // eslintrc shape (`plugins: ["react-hooks"]` as strings) even though the package is meant to
    // support flat config — feeding it to `extends` throws. Wiring the plugin object and its
    // rules directly sidesteps that, rather than waiting on the plugin's own flat-config export.
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs['recommended-latest'].rules,
    languageOptions: {
      ecmaVersion: 2023,
    },
  },
]);
