// Single source for the product's display name (AGENTS.md: "keep the product name in
// one config constant so it's easy to change" — the name isn't final yet).
//
// Plain CommonJS, not TypeScript: app.config.ts is evaluated by Expo's own config
// loader, which transpiles only that one entry file, not any TypeScript file it
// imports — a sibling .ts file fails to resolve under plain `require` (confirmed by
// actually running `expo export`, not assumed). A .js file needs no transpilation, so
// it resolves from both app.config.ts (Node, via require) and the in-app RN/TS code
// (via import — expo/tsconfig.base's allowJs covers this).
module.exports.PRODUCT_NAME = 'WagonWise';
