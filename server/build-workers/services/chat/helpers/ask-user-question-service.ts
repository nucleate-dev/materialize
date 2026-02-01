import { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { baseLogger } from "../../../worker.js";
import {
  AskUserQuestionInput,
  AskUserQuestionItem,
  AskUserResponseData,
  ChatEvent,
} from "../../../types/ChatTypes.js";
import { broadcastToConnections } from "../websocket-broadcast.js";
import { ChatConnection } from "../chat-engines/chat-engine.js";

const ASK_USER_QUESTION_TIMEOUT_MS = 60000; // 60 seconds

interface PendingQuestion {
  toolCallId: string;
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
  input: AskUserQuestionInput;
}

/**
 * Service to handle the AskUserQuestion tool.
 * Manages the lifecycle of questions: sending to frontend, waiting for response, handling timeouts.
 */
export class AskUserQuestionService {
  private pendingQuestions = new Map<string, PendingQuestion>();

  /**
   * Handle AskUserQuestion tool invocation.
   * Broadcasts question to frontend and waits for response.
   * Returns a Promise that resolves with the PermissionResult containing user answers.
   */
  public async askUserQuestion(
    toolCallId: string,
    input: AskUserQuestionInput,
    activeConnections: Map<string, ChatConnection>,
  ): Promise<PermissionResult> {
    // Validate input
    if (!input.questions || input.questions.length === 0) {
      baseLogger.warn("AskUserQuestion called with no questions", { toolCallId });
      return {
        behavior: "allow",
        updatedInput: {
          ...input,
          answers: {},
        },
      };
    }

    // Limit to 4 questions max
    if (input.questions.length > 4) {
      baseLogger.warn("AskUserQuestion limited to 4 questions", {
        toolCallId,
        requested: input.questions.length,
      });
      input.questions = input.questions.slice(0, 4);
    }

    // Validate each question has valid options
    const validatedQuestions: AskUserQuestionItem[] = [];
    for (const q of input.questions) {
      if (!q.options || q.options.length < 2) {
        baseLogger.warn("AskUserQuestion question has fewer than 2 options", {
          toolCallId,
          question: q.question,
          optionsCount: q.options?.length ?? 0,
        });
        // Skip invalid questions
        continue;
      }

      // Limit to 4 options per question
      const limitedOptions = q.options.slice(0, 4);
      validatedQuestions.push({
        ...q,
        options: limitedOptions,
      });
    }

    if (validatedQuestions.length === 0) {
      baseLogger.warn("AskUserQuestion has no valid questions after validation", { toolCallId });
      return {
        behavior: "allow",
        updatedInput: {
          questions: [],
          answers: {},
        },
      };
    }

    const validatedInput: AskUserQuestionInput = {
      questions: validatedQuestions,
    };

    return new Promise<PermissionResult>((resolve, reject) => {
      // Set up timeout - auto-resolve with first option for each question
      const timeoutId = setTimeout(() => {
        const pending = this.pendingQuestions.get(toolCallId);
        if (pending) {
          this.pendingQuestions.delete(toolCallId);
          baseLogger.info("AskUserQuestion timed out, using default answers", { toolCallId });

          // Return default answers (first option for each question)
          const defaultAnswers: Record<string, string> = {};
          for (const q of validatedInput.questions) {
            defaultAnswers[q.question] = q.options[0]?.label || "";
          }

          resolve({
            behavior: "allow",
            updatedInput: {
              questions: validatedInput.questions,
              answers: defaultAnswers,
            },
          });
        }
      }, ASK_USER_QUESTION_TIMEOUT_MS);

      // Store pending question
      this.pendingQuestions.set(toolCallId, {
        toolCallId,
        resolve,
        reject,
        timeoutId,
        input: validatedInput,
      });

      baseLogger.info("AskUserQuestion broadcasting to frontend", {
        toolCallId,
        questionCount: validatedInput.questions.length,
      });

      // Broadcast to frontend
      broadcastToConnections(
        activeConnections,
        {
          type: ChatEvent.ASK_USER_QUESTION,
          data: {
            tool_call_id: toolCallId,
            questions: validatedInput.questions,
            timeout_ms: ASK_USER_QUESTION_TIMEOUT_MS,
          },
        },
        baseLogger,
      );
    });
  }

  /**
   * Handle response from frontend.
   * Called when ASK_USER_RESPONSE message is received.
   */
  public handleUserResponse(data: AskUserResponseData): void {
    const pending = this.pendingQuestions.get(data.tool_call_id);
    if (!pending) {
      baseLogger.warn("Received AskUserQuestion response for unknown question", {
        toolCallId: data.tool_call_id,
      });
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeoutId);
    this.pendingQuestions.delete(data.tool_call_id);

    if (data.cancelled) {
      baseLogger.info("AskUserQuestion cancelled by user, using default answers", {
        toolCallId: data.tool_call_id,
      });

      // User cancelled - return default answers (first option for each question)
      const defaultAnswers: Record<string, string> = {};
      for (const q of pending.input.questions) {
        defaultAnswers[q.question] = q.options[0]?.label || "";
      }

      pending.resolve({
        behavior: "allow",
        updatedInput: {
          questions: pending.input.questions,
          answers: defaultAnswers,
        },
      });
      return;
    }

    baseLogger.info("AskUserQuestion received user response", {
      toolCallId: data.tool_call_id,
      answerCount: Object.keys(data.answers).length,
    });

    // Return user's answers
    pending.resolve({
      behavior: "allow",
      updatedInput: {
        questions: pending.input.questions,
        answers: data.answers,
      },
    });
  }

  /**
   * Check if there are any pending questions.
   */
  public hasPendingQuestions(): boolean {
    return this.pendingQuestions.size > 0;
  }

  /**
   * Clean up all pending questions (e.g., on disconnect).
   * Resolves all pending questions with default answers.
   */
  public cleanup(): void {
    for (const [toolCallId, pending] of this.pendingQuestions) {
      clearTimeout(pending.timeoutId);

      baseLogger.info("AskUserQuestion cleanup - resolving with defaults", { toolCallId });

      // Resolve with default answers
      const defaultAnswers: Record<string, string> = {};
      for (const q of pending.input.questions) {
        defaultAnswers[q.question] = q.options[0]?.label || "";
      }

      pending.resolve({
        behavior: "allow",
        updatedInput: {
          questions: pending.input.questions,
          answers: defaultAnswers,
        },
      });
    }
    this.pendingQuestions.clear();
  }
}
