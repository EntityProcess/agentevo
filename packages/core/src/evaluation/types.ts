/**
 * JSON primitive values appearing in AgentV payloads.
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Immutable JSON object representation for test fixtures.
 */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/**
 * Recursive JSON value supporting nested structures.
 */
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

const TEST_MESSAGE_ROLE_VALUES = ["system", "user", "assistant", "tool"] as const;

/**
 * Immutable list of supported message roles.
 */
export const TEST_MESSAGE_ROLES = TEST_MESSAGE_ROLE_VALUES;

/**
 * Role literals used by test messages.
 */
export type TestMessageRole = (typeof TEST_MESSAGE_ROLE_VALUES)[number];

const TEST_MESSAGE_ROLE_SET: ReadonlySet<string> = new Set(TEST_MESSAGE_ROLE_VALUES);

/**
 * Text or structured payload attached to a message.
 */
export type TestMessageContent = string | readonly JsonObject[];

/**
 * System-authored instruction message.
 */
export type SystemTestMessage = {
  readonly role: "system";
  readonly content: TestMessageContent;
};

/**
 * User-authored prompt message.
 */
export type UserTestMessage = {
  readonly role: "user";
  readonly content: TestMessageContent;
};

/**
 * Assistant response message.
 */
export type AssistantTestMessage = {
  readonly role: "assistant";
  readonly content: TestMessageContent;
};

/**
 * Tool invocation message.
 */
export type ToolTestMessage = {
  readonly role: "tool";
  readonly content: TestMessageContent;
};

/**
 * Conversation message union with role discrimination.
 */
export type TestMessage =
  | SystemTestMessage
  | UserTestMessage
  | AssistantTestMessage
  | ToolTestMessage;

/**
 * Guard validating supported message roles.
 */
export function isTestMessageRole(value: unknown): value is TestMessageRole {
  return typeof value === "string" && TEST_MESSAGE_ROLE_SET.has(value);
}

/**
 * Guard matching AgentV JSON objects.
 */
export function isJsonObject(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

/**
 * Guard matching AgentV JSON values.
 */
export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === "object") {
    return isJsonObject(value);
  }
  return false;
}

/**
 * Guard validating raw test messages.
 */
export function isTestMessage(value: unknown): value is TestMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { role?: unknown; content?: unknown };
  if (!isTestMessageRole(candidate.role)) {
    return false;
  }
  if (typeof candidate.content === "string") {
    return true;
  }
  if (!Array.isArray(candidate.content)) {
    return false;
  }
  return candidate.content.every(isJsonObject);
}

const GRADER_KIND_VALUES = ["heuristic", "llm_judge"] as const;

/**
 * Supported grader implementations.
 */
export const GRADER_KINDS = GRADER_KIND_VALUES;

/**
 * Grader identifiers available to the pipeline.
 */
export type GraderKind = (typeof GRADER_KIND_VALUES)[number];

const GRADER_KIND_SET: ReadonlySet<string> = new Set(GRADER_KIND_VALUES);

/**
 * Guard validating grader identifiers.
 */
export function isGraderKind(value: unknown): value is GraderKind {
  return typeof value === "string" && GRADER_KIND_SET.has(value);
}

/**
 * Test case definition sourced from AgentV specs.
 */
export interface TestCase {
  readonly id: string;
  readonly conversation_id?: string;
  readonly task: string;
  readonly user_segments: readonly JsonObject[];
  readonly expected_assistant_raw: string;
  readonly guideline_paths: readonly string[];
  readonly code_snippets: readonly string[];
  readonly outcome: string;
  readonly grader: GraderKind;
}

/**
 * Evaluator scorecard for a single test case run.
 */
export interface EvaluationResult {
  readonly eval_id: string;
  readonly conversation_id?: string;
  readonly score: number;
  readonly hits: readonly string[];
  readonly misses: readonly string[];
  readonly model_answer: string;
  readonly expected_aspect_count: number;
  readonly target: string;
  readonly timestamp: string;
  readonly reasoning?: string;
  readonly raw_aspects?: readonly string[];
  readonly raw_request?: JsonObject;
  readonly grader_raw_request?: JsonObject;
}

/**
 * Convenience accessor matching the Python hit_count property.
 */
export function getHitCount(result: Pick<EvaluationResult, "hits">): number {
  return result.hits.length;
}
