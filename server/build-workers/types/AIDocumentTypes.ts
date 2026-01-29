/**
 * Types for AI Document Generation endpoint
 * Used for PRD generation, design critiques, and other document-style AI outputs
 */

/**
 * Supported document generation types
 */
export type AIDocumentType = "generate-prd" | "critique-designs";

/**
 * Screen data included in document generation request
 */
export interface AIDocumentScreen {
  /** Route path for this screen (e.g., "/", "/dashboard", "/settings") */
  path: string;
  /** Base64-encoded screenshot data URL */
  screenshotDataUrl: string;
}

/**
 * Request body for POST /api/ai/document
 */
export interface AIDocumentRequest {
  /** Type of document to generate */
  type: AIDocumentType;
  /** Prototype ID for context and billing */
  prototypeId: string;
  /** Optional prototype name for document context */
  prototypeName?: string;
  /** Array of screens with paths and screenshots */
  screens: AIDocumentScreen[];
  /** Optional framework context (e.g., "nextjs", "expo") */
  framework?: string;
  /** Optional design system context */
  designSystem?: string;
}

/**
 * Generated document content
 */
export interface AIDocument {
  /** Document title */
  title: string;
  /** Markdown content of the generated document */
  content: string;
  /** ISO timestamp of generation */
  generatedAt: string;
  /** AI model used for generation */
  model: string;
  /** Token usage statistics */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Cost in USD */
  costUsd?: number;
}

/**
 * Response body for POST /api/ai/document
 */
export interface AIDocumentResponse {
  /** Whether generation was successful */
  success: boolean;
  /** Generated document (present if success is true) */
  document?: AIDocument;
  /** Error message (present if success is false) */
  error?: string;
  /** Credits charged for this generation */
  creditsCharged?: number;
}
