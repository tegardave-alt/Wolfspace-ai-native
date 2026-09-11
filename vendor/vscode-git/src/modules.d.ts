// Type stubs for two small npm packages that ship no declarations.
//
// which@2 and byline@5 are CommonJS and untyped. Upstream VS Code gets their
// types from @types/* packages it already depends on; adding those here would
// be two more devDependencies for two identifiers. git.ts uses `which(bin)`
// and `byline(stream)` and nothing else from either, so `any` is honest.
declare module "which";
declare module "byline";
