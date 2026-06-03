import type { CapacityPoint, StudyTask } from "@/lib/types";
import { localSchedule } from "@/lib/cognitive-model";
import type { GoogleCalendarEvent } from "@/lib/google-oauth";

type AgentScheduleInput = {
  googleAccessToken: string;
  tasks: StudyTask[];
  curve: CapacityPoint[];
  startIso: string;
  timezone: string;
};

type CalendarTaskGenerationInput = {
  timezone: string;
  existingTasks: StudyTask[];
  calendarEvents: GoogleCalendarEvent[];
};

function extractJson(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  return JSON.parse(raw);
}

function responseOutputText(data: {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
}) {
  return (
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? "")
      .join("\n") ??
    ""
  );
}

function openAiFallbackExplanation(status: number, errorText: string) {
  const normalizedError = errorText.toLowerCase();

  if (status === 429 && normalizedError.includes("quota")) {
    return "OpenAI API quota is unavailable. Add API billing credits or raise the project spending limit to enable calendar-aware AI scheduling. A local curve-based schedule was generated instead.";
  }

  if (status === 429) {
    return "OpenAI API rate limits were reached. Try scheduling again shortly. A local curve-based schedule was generated instead.";
  }

  if (status === 401) {
    return "The OpenAI API key was rejected. Replace OPENAI_API_KEY with an active project API key. A local curve-based schedule was generated instead.";
  }

  return "OpenAI scheduling is temporarily unavailable. A local curve-based schedule was generated instead.";
}

export async function runSchedulingAgent(input: AgentScheduleInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      source: "local-fallback",
      explanation: "OPENAI_API_KEY is not configured, so a local curve-based schedule was generated.",
      blocks: localSchedule(input.tasks, input.curve, new Date(input.startIso))
    };
  }

  const compactCurve = input.curve
    .filter((_, index) => index % 4 === 0)
    .map((point) => ({ label: point.label, hour: point.hour, score: point.score }));

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You are a cognitive capacity scheduling agent. Use the supplied startIso as the planning clock, even when it differs from the real wall-clock time. Use Google Calendar through the MCP connector to inspect availability and existing events in the 24 hours after startIso before placing any task. Treat every non-transparent calendar event as a hard busy block, including school hours, classes, tutoring, meetings, interviews, appointments, clubs, meals, and travel. Never overlap a generated study block with a busy calendar event or another study block. Attempt to place every supplied incomplete task within the next 24 hours when a conflict-free slot exists, prioritizing earlier deadlines. Choose slots that match hard tasks to high capacity scores, medium tasks to good scores, and low tasks to lower/review windows. If a task cannot fit, omit it from blocks so the app can queue it for a later planning pass. Return only JSON."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Create a study schedule for the next 24 hours. If the connector allows calendar event creation, create the study blocks on Google Calendar. Always return JSON with explanation and blocks.",
            timezone: input.timezone,
            startIso: input.startIso,
            tasks: input.tasks,
            capacityCurve: compactCurve,
            expectedJsonShape: {
              explanation: "short string",
              blocks: [
                {
                  task_id: "task id or null",
                  title: "event title",
                  start_at: "ISO datetime",
                  end_at: "ISO datetime",
                  capacity_score: 0,
                  google_event_id: "id if created, otherwise null"
                }
              ]
            }
          })
        }
      ],
      tools: [
        {
          type: "mcp",
          server_label: "google_calendar",
          connector_id: "connector_googlecalendar",
          authorization: input.googleAccessToken,
          require_approval: "never"
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      source: "local-fallback",
      explanation: openAiFallbackExplanation(response.status, errorText),
      blocks: localSchedule(input.tasks, input.curve, new Date(input.startIso))
    };
  }

  const data = await response.json();
  const parsed = extractJson(responseOutputText(data) || "{}");

  const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  if (blocks.length === 0 && input.tasks.length > 0) {
    return {
      source: "local-fallback",
      explanation:
        "OpenAI connected to Google Calendar but did not return study blocks. A local curve-based schedule was generated instead.",
      blocks: localSchedule(input.tasks, input.curve, new Date(input.startIso))
    };
  }

  return {
    source: "openai-mcp",
    explanation: parsed.explanation ?? "Schedule generated by the OpenAI agent with Google Calendar MCP.",
    blocks
  };
}

export async function runCalendarTaskGenerationAgent(input: CalendarTaskGenerationInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You are a study planning assistant. Use the supplied Google Calendar events, which were already filtered to academic sources. Infer useful preparation tasks from those events only. Do not create or modify calendar events. Avoid duplicates and return only JSON."
        },
        {
          role: "user",
          content: JSON.stringify({
            task:
              "Generate one actionable preparation task for each supplied academic calendar event, up to 6 tasks. Use concise titles. Estimate realistic minutes and difficulty. Set due_at before the related event when possible. For every task, preserve the exact source calendar event title, event start time, and event id. Return an empty array only when the supplied calendarEvents array is empty.",
            timezone: input.timezone,
            calendarEvents: input.calendarEvents,
            existingTasks: input.existingTasks.map((task) => ({
              title: task.title,
              due_at: task.due_at ?? null
            })),
            expectedJsonShape: {
              explanation: "short string",
              tasks: [
                {
                  title: "task title",
                  description: "why this preparation task was inferred",
                  difficulty: "low | medium | high",
                  estimated_minutes: 60,
                  due_at: "ISO datetime or null",
                  source_event_title: "exact Google Calendar event title",
                  source_event_at: "source event ISO datetime or null",
                  source_event_id: "source Google Calendar event id or null"
                }
              ]
            }
          })
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(openAiFallbackExplanation(response.status, errorText).replace(" A local curve-based schedule was generated instead.", ""));
  }

  const data = await response.json();
  let parsed: { explanation?: string; tasks?: unknown[] };
  try {
    parsed = extractJson(responseOutputText(data) || "{}");
  } catch {
    parsed = {};
  }

  const generatedTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  if (generatedTasks.length === 0 && input.calendarEvents.length > 0) {
    return {
      source: "calendar-fallback",
      explanation: "Academic calendar events were found. Preparation tasks were generated with the calendar fallback.",
      tasks: input.calendarEvents.slice(0, 6).map((event) => ({
        title: `Prepare for ${event.title.replace("[Planner Demo] ", "")}`,
        description: `Prepare for the upcoming calendar event: ${event.title}.`,
        difficulty: "medium",
        estimated_minutes: 60,
        due_at: new Date(new Date(event.startAt).getTime() - 60 * 60 * 1000).toISOString(),
        source_event_title: event.title,
        source_event_at: event.startAt,
        source_event_id: event.id
      }))
    };
  }

  return {
    source: "openai-calendar",
    explanation: parsed.explanation ?? "Calendar review completed.",
    tasks: generatedTasks
  };
}
