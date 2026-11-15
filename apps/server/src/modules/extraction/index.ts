// Extraction jobs and reading receipts with the LLM server (SPEC.md §4.3, §6.3). The only file other modules may import.
export { createExtractionModule, type ExtractionModuleOptions } from "./adapters/extraction-module.ts";
export { RelayExtractor, type RelayExtractorOptions } from "./adapters/relay-extractor.ts";
export type { ReceiptExtractor, ReceiptsGateway } from "./ports.ts";
