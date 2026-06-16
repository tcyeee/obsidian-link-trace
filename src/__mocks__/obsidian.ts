// Minimal stub for the `obsidian` runtime package so vitest (node env) can
// import modules that depend on it without a real Obsidian host.
export const MarkdownView = class {};
export const Notice = class {};
export const TFile = class {};
export const setIcon = () => {};
export const setTooltip = () => {};
export const parseYaml = (_s: string) => ({});
