import "@testing-library/jest-dom";

if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value));
}
