import { z } from 'zod';

/* ---------- Enums (mirror Postgres enums in supabase/migrations) ---------- */

export const AGENT_ACTIVITIES = [
  'working',
  'idle',
  'break',
  'meeting',
  'walking_to_review',
  'reviewing',
  'offline',
] as const;
export const AgentActivity = z.enum(AGENT_ACTIVITIES);
export type AgentActivity = z.infer<typeof AgentActivity>;

export const TASK_STATUSES = [
  'queued',
  'routing',
  'in_progress',
  'awaiting_review',
  'needs_revision',
  'awaiting_approval',
  'executing',
  'done',
  'failed',
  'cancelled',
] as const;
export const TaskStatus = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const ACTION_STATUSES = ['proposed', 'approved', 'rejected', 'executed', 'failed'] as const;
export const ActionStatus = z.enum(ACTION_STATUSES);
export type ActionStatus = z.infer<typeof ActionStatus>;

export const AssignMode = z.enum(['auto', 'manual']);
export type AssignMode = z.infer<typeof AssignMode>;

export const TaskEventType = z.enum([
  'routed',
  'started',
  'tool_call',
  'tool_result',
  'draft',
  'review',
  'approval',
  'executed',
  'failed',
  'note',
]);
export type TaskEventType = z.infer<typeof TaskEventType>;

export const ActionKind = z.enum([
  'send_whatsapp',
  'send_whatsapp_bulk',
  'send_email',
  'create_invoice',
  'schedule_post',
]);
export type ActionKind = z.infer<typeof ActionKind>;

export const ReviewVerdict = z.enum(['approved', 'revise']);
export type ReviewVerdict = z.infer<typeof ReviewVerdict>;

export const LlmPurpose = z.enum(['route', 'run', 'review', 'chat']);
export type LlmPurpose = z.infer<typeof LlmPurpose>;

export const ChatRole = z.enum(['user', 'assistant']);
export type ChatRole = z.infer<typeof ChatRole>;

export const TOOL_NAMES = [
  'submit_result',
  'search_knowledge',
  'save_draft',
  'list_tasks',
  'delegate_task',
  'read_sheet',
  'score_leads',
  'run_analysis',
  'create_google_doc',
  'propose_whatsapp_reply',
  'propose_whatsapp_broadcast',
  'propose_email',
  'propose_invoice',
  'propose_schedule_post',
] as const;
export const ToolName = z.enum(TOOL_NAMES);
export type ToolName = z.infer<typeof ToolName>;

/* ---------- Shared primitives ---------- */

export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus format #rrggbb');

export const AgentId = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'ID agen hanya huruf kecil, angka, dan garis bawah');
export type AgentId = z.infer<typeof AgentId>;

/** Timestamps arrive as ISO strings from PostgREST and as Date from node-postgres. */
const Timestamp = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)));
const NullableTimestamp = Timestamp.nullable();

/** bigint / numeric columns can arrive as strings from node-postgres. */
const NumericLike = z.union([z.number(), z.string()]).pipe(z.coerce.number());

export const Appearance = z.object({
  shirt: HexColor,
  hair: HexColor,
  skin: HexColor,
});
export type Appearance = z.infer<typeof Appearance>;

/* ---------- Agent config (packages/shared/src/agents.config.ts) ---------- */

export const AgentConfig = z.object({
  id: AgentId,
  name: z.string().min(1),
  role: z.string().min(1),
  focus: z.string().min(1),
  deskId: z.string().min(1),
  isManager: z.boolean().default(false),
  tools: z.array(ToolName),
  idleLines: z.array(z.string().min(1)).min(2),
  appearance: Appearance,
});
export type AgentConfig = z.infer<typeof AgentConfig>;

/* ---------- Office layout (config/office.layout.json) ---------- */

export const Point = z.tuple([z.number(), z.number()]);
export type Point = z.infer<typeof Point>;
/** [x, y, w, d] in tile units. */
export const Rect = z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]);
export type Rect = z.infer<typeof Rect>;

export const ZoneId = z.enum(['work', 'meeting', 'pantry']);
export type ZoneId = z.infer<typeof ZoneId>;

export const Desk = z.object({
  id: z.string().regex(/^d-\d+-\d+$/),
  /** Desk center on the x axis. */
  x: z.number(),
  /** Back edge of the desk on the y axis. */
  y: z.number(),
  w: z.number().positive(),
  d: z.number().positive(),
  seat: Point,
});
export type Desk = z.infer<typeof Desk>;

export const Wall = z.object({
  id: z.string().min(1),
  kind: z.enum(['solid', 'glass']),
  rect: Rect,
});
export type Wall = z.infer<typeof Wall>;

export const FurnitureKind = z.enum([
  'meeting_table',
  'pantry_counter',
  'sofa',
  'coffee_table',
  'plant',
]);

export const Furniture = z.object({
  id: z.string().min(1),
  kind: FurnitureKind,
  rect: Rect,
  /** Visual height in pixels at scale 1. */
  height: z.number().positive(),
});
export type Furniture = z.infer<typeof Furniture>;

export const WindowSpec = z.object({
  wall: z.enum(['back', 'left']),
  /** Start offset along the wall in tiles. */
  at: z.number(),
  len: z.number().positive(),
});
export type WindowSpec = z.infer<typeof WindowSpec>;

export const OfficeLayout = z.object({
  grid: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
  zones: z.array(z.object({ id: ZoneId, rect: Rect })),
  desks: z.array(Desk).min(1),
  spots: z.object({
    pantry: z.array(Point).min(1),
    meeting: z.array(Point).min(1),
    lounge: z.array(Point).min(1),
    wander: z.array(Point).min(1),
  }),
  walls: z.array(Wall),
  furniture: z.array(Furniture),
  windows: z.array(WindowSpec),
});
export type OfficeLayout = z.infer<typeof OfficeLayout>;

/* ---------- Database rows (supabase/migrations/0001_init.sql) ---------- */

export const AgentRow = z.object({
  id: AgentId,
  org_id: z.guid(),
  name: z.string(),
  role: z.string(),
  focus: z.string(),
  system_prompt: z.string(),
  model: z.string(),
  tools: z.array(ToolName),
  desk_id: z.string(),
  appearance: Appearance,
  idle_lines: z.array(z.string()),
  is_manager: z.boolean(),
  enabled: z.boolean(),
  monthly_token_budget: z.number().int().nullable(),
  created_at: Timestamp,
});
export type AgentRow = z.infer<typeof AgentRow>;

export const AgentStateRow = z.object({
  agent_id: AgentId,
  org_id: z.guid(),
  activity: AgentActivity,
  status_text: z.string(),
  current_task_id: z.guid().nullable(),
  /** 'desk' | 'pantry' | 'meeting' | 'lounge' | 'desk:<agent_id>' */
  target_spot: z.string().nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type AgentStateRow = z.infer<typeof AgentStateRow>;

export const TaskRow = z.object({
  id: z.guid(),
  org_id: z.guid(),
  title: z.string(),
  instructions: z.string().nullable(),
  requested_by: z.guid(),
  assignee_id: AgentId.nullable(),
  assign_mode: AssignMode,
  parent_task_id: z.guid().nullable(),
  status: TaskStatus,
  priority: z.number().int().min(1).max(3),
  result_text: z.string().nullable(),
  result_json: z.unknown().nullable(),
  revision_count: z.number().int().nonnegative(),
  error: z.string().nullable(),
  created_at: Timestamp,
  started_at: NullableTimestamp,
  finished_at: NullableTimestamp,
});
export type TaskRow = z.infer<typeof TaskRow>;

export const TaskEventRow = z.object({
  id: NumericLike,
  org_id: z.guid(),
  task_id: z.guid().nullable(),
  agent_id: AgentId.nullable(),
  type: TaskEventType,
  payload: z.record(z.string(), z.unknown()),
  created_at: Timestamp,
});
export type TaskEventRow = z.infer<typeof TaskEventRow>;

export const ReviewScores = z.object({
  accuracy: z.number().int().min(1).max(5),
  tone: z.number().int().min(1).max(5),
  completeness: z.number().int().min(1).max(5),
});
export type ReviewScores = z.infer<typeof ReviewScores>;

export const ReviewRow = z.object({
  id: z.guid(),
  org_id: z.guid(),
  task_id: z.guid(),
  reviewer_id: AgentId,
  verdict: ReviewVerdict,
  notes: z.string(),
  scores: ReviewScores.nullable(),
  created_at: Timestamp,
});
export type ReviewRow = z.infer<typeof ReviewRow>;

export const ActionRow = z.object({
  id: z.guid(),
  org_id: z.guid(),
  task_id: z.guid(),
  agent_id: AgentId,
  kind: ActionKind,
  payload: z.record(z.string(), z.unknown()),
  status: ActionStatus,
  approved_by: z.guid().nullable(),
  approved_at: NullableTimestamp,
  executed_at: NullableTimestamp,
  response: z.unknown().nullable(),
  original_payload: z.record(z.string(), z.unknown()).nullable().default(null),
  rejected_by: z.guid().nullable().default(null),
  rejected_at: NullableTimestamp.default(null),
  error: z.string().nullable().default(null),
  created_at: Timestamp,
});
export type ActionRow = z.infer<typeof ActionRow>;

export const ChatMessageRow = z.object({
  id: NumericLike,
  org_id: z.guid(),
  agent_id: AgentId,
  user_id: z.guid(),
  role: ChatRole,
  content: z.string(),
  created_at: Timestamp,
});
export type ChatMessageRow = z.infer<typeof ChatMessageRow>;

export const LlmUsageRow = z.object({
  id: NumericLike,
  org_id: z.guid(),
  agent_id: AgentId.nullable(),
  task_id: z.guid().nullable(),
  purpose: LlmPurpose,
  model: z.string(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cache_read_tokens: z.number().int().nonnegative(),
  cache_write_tokens: z.number().int().nonnegative().default(0),
  cost_usd: NumericLike,
  created_at: Timestamp,
});
export type LlmUsageRow = z.infer<typeof LlmUsageRow>;

export const KnowledgeDocRow = z.object({
  id: z.guid(),
  org_id: z.guid(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type KnowledgeDocRow = z.infer<typeof KnowledgeDocRow>;

export const SettingsRow = z.object({
  org_id: z.guid(),
  auto_approve_kinds: z.array(ActionKind),
  dry_run: z.boolean(),
  usd_to_idr: NumericLike,
  meeting_until: NullableTimestamp,
  break_mode: z.boolean(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type SettingsRow = z.infer<typeof SettingsRow>;

/* ---------- Environment ---------- */

export const PublicEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});
export type PublicEnv = z.infer<typeof PublicEnv>;

export const MemberRole = z.enum(['owner', 'staff', 'viewer']);
export type MemberRole = z.infer<typeof MemberRole>;
