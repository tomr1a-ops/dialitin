import Anthropic from "@anthropic-ai/sdk";
import type { DiagnosisResult } from "@/lib/engine/diagnose";
import type { CoachingContent } from "@/lib/engine/content";
import { createSecretSupabaseClient } from "@/lib/supabase/admin";
import {
  buildCoachPrompt,
  coachOutputValidation,
  COACH_RETRY_INSTRUCTION,
  fallbackCoachOutput,
  parseCoachJson,
  validateCoachOutput,
  type CoachExplainInput,
  type CoachOutput,
} from "@/lib/coach/schema";

const MODEL = "claude-haiku-4-5-20251001";
const INPUT_COST_PER_M = 0.8;
const OUTPUT_COST_PER_M = 4;

export type ExplainResult = {
  output: CoachOutput;
  usedFallback: boolean;
  retried: boolean;
  validation: { valid: boolean; errors: string[] };
  costUsd: number | null;
  coachCallId: string | null;
  skipped: boolean;
  skipReason?: string;
};

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_M +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_M
  );
}

async function callCoachModel(
  client: Anthropic,
  prompt: string,
): Promise<{
  rawText: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return {
    rawText: textBlock?.type === "text" ? textBlock.text : "",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function parseAndValidate(rawText: string): {
  output: CoachOutput | null;
  validation: { valid: boolean; errors: string[] };
} {
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const output = parseCoachJson(jsonMatch?.[0] ?? rawText);
    const validation = coachOutputValidation(output);
    return { output, validation };
  } catch {
    return {
      output: null,
      validation: validateCoachOutput(rawText),
    };
  }
}

export async function explainDiagnosis(
  input: CoachExplainInput & {
    content: CoachingContent;
    diagnosisId?: string | null;
    persist?: boolean;
  },
): Promise<ExplainResult> {
  const { diagnosis, content } = input;

  if (diagnosis.outcome !== "fault") {
    const headline = diagnosis.headline_fault ?? "Analysis complete";
    const why =
      diagnosis.reasons.length > 0
        ? diagnosis.reasons.join(". ")
        : headline;
    return {
      output: {
        headline,
        why,
        feel_cue: "",
        drill: {
          name: "",
          protocol_seconds: 60,
          reps_slow: 0,
          reps_rehearsal: 0,
          reps_live: 0,
          constraint: "",
        },
      },
      usedFallback: true,
      retried: false,
      validation: { valid: true, errors: [] },
      costUsd: null,
      coachCallId: null,
      skipped: true,
      skipReason: `outcome=${diagnosis.outcome}`,
    };
  }

  const voice =
    input.voice ??
    content.voice.find((v) => v.fault_key === diagnosis.fault_key) ??
    null;
  const protocol =
    input.protocol ??
    content.protocols.find((p) => p.id === diagnosis.protocol_id) ??
    content.protocols.find((p) => p.fault_key === diagnosis.fault_key) ??
    null;

  const basePromptInput: CoachExplainInput = {
    diagnosis,
    voice,
    protocol,
    level: input.level,
    symptom: input.symptom,
    isFirstResult: input.isFirstResult,
  };

  const prompt = buildCoachPrompt(basePromptInput);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const fb = voice
      ? fallbackCoachOutput(voice, protocol)
      : {
          headline: diagnosis.headline_fault ?? "Fault detected",
          why: diagnosis.headline_fault ?? "",
          feel_cue: "",
          drill: {
            name: protocol?.name ?? "",
            protocol_seconds: 60 as const,
            reps_slow: protocol?.reps_slow ?? 3,
            reps_rehearsal: protocol?.reps_rehearsal ?? 1,
            reps_live: protocol?.reps_live ?? 1,
            constraint: protocol?.constraint_text ?? "",
          },
        };
    const callId = await logCoachCall({
      diagnosisId: input.diagnosisId,
      prompt,
      output: fb,
      validation: { valid: true, errors: ["no API key, fallback"] },
      model: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      persist: input.persist,
    });
    return {
      output: fb,
      usedFallback: true,
      retried: false,
      validation: { valid: true, errors: ["no API key"] },
      costUsd: null,
      coachCallId: callId,
      skipped: false,
    };
  }

  const client = new Anthropic({ apiKey });
  let totalInput = 0;
  let totalOutput = 0;
  let retried = false;

  const first = await callCoachModel(client, prompt);
  totalInput += first.inputTokens;
  totalOutput += first.outputTokens;

  let parsed = parseAndValidate(first.rawText);
  let output = parsed.output;
  let validation = parsed.validation;
  let usedFallback = false;

  if (!validation.valid || !output) {
    retried = true;
    const retryPrompt = buildCoachPrompt({
      ...basePromptInput,
      retryNote: COACH_RETRY_INSTRUCTION,
    });
    const second = await callCoachModel(client, retryPrompt);
    totalInput += second.inputTokens;
    totalOutput += second.outputTokens;
    parsed = parseAndValidate(second.rawText);
    output = parsed.output;
    validation = parsed.validation;
  }

  if (!validation.valid || !output) {
    if (voice) {
      output = fallbackCoachOutput(voice, protocol);
      usedFallback = true;
    } else {
      output = {
        headline: diagnosis.headline_fault ?? "Fault detected",
        why: diagnosis.headline_fault ?? "",
        feel_cue: "",
        drill: {
          name: protocol?.name ?? "",
          protocol_seconds: 60,
          reps_slow: protocol?.reps_slow ?? 3,
          reps_rehearsal: protocol?.reps_rehearsal ?? 1,
          reps_live: protocol?.reps_live ?? 1,
          constraint: protocol?.constraint_text ?? "",
        },
      };
      usedFallback = true;
    }
  }

  const costUsd = estimateCost(totalInput, totalOutput);
  const callId = await logCoachCall({
    diagnosisId: input.diagnosisId,
    prompt: retried
      ? `${prompt}\n\n--- RETRY ---\n${COACH_RETRY_INSTRUCTION}`
      : prompt,
    output,
    validation: usedFallback
      ? { valid: false, errors: [...validation.errors, "fallback used"] }
      : validation,
    model: MODEL,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    costUsd,
    persist: input.persist,
  });

  return {
    output,
    usedFallback,
    retried,
    validation,
    costUsd,
    coachCallId: callId,
    skipped: false,
  };
}

async function logCoachCall(input: {
  diagnosisId?: string | null;
  prompt: string;
  output: CoachOutput;
  validation: { valid: boolean; errors: string[] };
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  persist?: boolean;
}): Promise<string | null> {
  if (input.persist === false) {
    return null;
  }
  try {
    const secret = createSecretSupabaseClient();
    const { data, error } = await secret
      .from("coach_calls")
      .insert({
        diagnosis_id: input.diagnosisId ?? null,
        prompt: input.prompt,
        output: input.output,
        validation_result: input.validation,
        model: input.model,
        input_tokens: input.inputTokens,
        output_tokens: input.outputTokens,
        cost_usd: input.costUsd,
      })
      .select("id")
      .single();
    if (error) {
      console.error("coach_calls insert failed", error.message);
      return null;
    }
    return data.id as string;
  } catch (err) {
    console.error("coach_calls log error", err);
    return null;
  }
}

export type { DiagnosisResult, CoachOutput };
