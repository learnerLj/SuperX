import type {
  Post,
  Source,
  Usage,
  Metadata,
  FailureDetails,
  RequestDiagnostics,
} from "./types";
export type Stage = "verify" | "comments";
export type Content =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: string };
export interface Input {
  role: string;
  content: string | Content[];
}
export interface Request {
  model: string;
  instructions: string;
  input: Input[];
  tools: {
    type: string;
    enable_image_understanding?: boolean;
    enable_video_understanding?: boolean;
  }[];
  tool_choice?: string;
  max_output_tokens: number;
  stream: boolean;
  store: boolean;
  reasoning?: { effort: string };
  text?: {
    format: {
      type: string;
      name: string;
      strict: boolean;
      schema: {
        type: string;
        minItems: number;
        maxItems: number;
        items: { type: string; minLength: number; maxLength: number };
      };
    };
  };
}
export interface Channel {
  channel?: string;
  phase?: string;
  recipient?: string | null;
}
export interface Annotation {
  type?: string;
  url?: unknown;
  title?: unknown;
  url_citation?: Annotation;
}
export interface Part extends Channel {
  type?: string;
  text?: string;
  annotations?: Annotation[];
}
export interface Item extends Channel {
  id?: string;
  type?: string;
  role?: string;
  content?: Part[];
  name?: string;
  function?: { name?: string };
}
/** Only fields observed by the Responses reader; JSON is unknown until this boundary. */
export interface Response {
  id?: string;
  status?: string;
  output?: Item[];
  citations?: (string | Annotation)[];
  usage?: unknown;
  model?: unknown;
  incomplete_details?: { reason?: string };
}
export interface Event extends Channel {
  type: string;
  response?: Response;
  response_id?: string;
  item_id?: string;
  output_index?: number;
  content_index?: number;
  item?: Item;
  part?: Part;
  delta?: string;
  text?: string;
}
export interface TrackerState {
  item: Item;
  parts: Map<number, Part>;
  known: boolean;
  index?: number;
}
export interface Context {
  replyContext?: Post;
  threadContext?: Post[];
  quotedContext?: Post[];
  hasMedia?: boolean;
}
export interface ProjectedPost extends Omit<Post, "text" | "quotedContext"> {
  text?: string;
  quotedContext?: ProjectedPost[];
}
export interface ProjectedContext {
  replyContext?: ProjectedPost;
  threadContext?: ProjectedPost[];
  quotedContext?: ProjectedPost[];
  hasMedia?: boolean;
}
export interface Redaction {
  secrets?: string[];
  inputs?: (string | undefined)[];
  media?: boolean;
}
export interface Result extends Metadata {
  [field: string]: unknown;
  text: string;
  sources?: Source[];
  searched?: boolean;
  verificationFailure?: FailureDetails;
  requestDiagnostics?: RequestDiagnostics;
  provider?: "api" | "oauth" | "build" | "x-native";
  task?: string;
  verified?: boolean;
  apiVerification?: string;
  verificationStatus?:
    | "pending"
    | "running"
    | "completed"
    | "unverified"
    | "incomplete"
    | "failed";
  warning?: string;
  completedAt?: number;
}
export type UsageKey =
  | "input_tokens"
  | "output_tokens"
  | "total_tokens"
  | "num_sources_used"
  | "num_server_side_tools_used"
  | "cost_in_usd_ticks";
export type DetailKey =
  | "input_tokens_details"
  | "output_tokens_details"
  | "server_side_tool_usage_details";
