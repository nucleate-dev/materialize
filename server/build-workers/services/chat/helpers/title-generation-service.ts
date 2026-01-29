/**
 * Title Generation Service
 *
 * Generates short prototype titles from user messages using Gemini Flash.
 */

import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { SystemLogger } from "../../../loggers/SystemLogger.js";

const TITLE_MODEL = "gemini-2.5-flash";

const TITLE_SYSTEM_PROMPT = `You are a title generator. Given a user's message describing what they want to build, generate a short, descriptive title for their project.

Rules:
- The title must be 2-5 words
- Use title case (capitalize first letter of each word)
- Be descriptive but concise
- No punctuation at the end
- No quotes around the title
- Just output the title, nothing else

Examples:
- "I want to build a todo app" -> "Todo App"
- "Create a weather dashboard that shows forecasts" -> "Weather Dashboard"
- "Build me an e-commerce site for selling shoes" -> "Shoe Store"
- "I need a portfolio website" -> "Portfolio Website"
- "Make a chat application with real-time messaging" -> "Real Time Chat App"`;

/**
 * Generate a short title for a prototype based on the user's first message.
 */
export async function generatePrototypeTitle(
  userMessage: string,
  logger: SystemLogger,
): Promise<string | null> {
  try {
    const modelInstance = google(TITLE_MODEL);

    const result = await generateText({
      model: modelInstance,
      system: TITLE_SYSTEM_PROMPT,
      prompt: userMessage,
    });

    const title = result.text?.trim();

    if (!title || title.length === 0 || title.length > 50) {
      logger.warn("Generated title was invalid", {
        title,
        userMessage: userMessage.substring(0, 100),
      });
      return null;
    }

    logger.info("Generated prototype title", {
      title,
      userMessagePreview: userMessage.substring(0, 50),
    });

    return title;
  } catch (error) {
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Failed to generate prototype title",
      { userMessage: userMessage.substring(0, 100) },
    );
    return null;
  }
}
