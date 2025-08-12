import { ProductKeys } from "@/GlobalConstants";
import { Database } from "@/lib/types/database.types";
import { extractExecutionPlan } from "@/lib/utils/code/planningExtractor";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY ?? "";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

const google = createGoogleGenerativeAI({
  apiKey: GOOGLE_AI_API_KEY,
});

type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];

interface PrototypeFiles {
  [filePath: string]: PrototypeFile;
}

// Allow longer response times for AI generation
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // ------------------------------------------------------------------------------------------------
    // 1. JWT Token validation -- must be an AUTHORIZED user
    // ------------------------------------------------------------------------------------------------
    const token = request.headers.get("authorization")?.split(" ")[1];
    if (!token || !request.headers.get("authorization")?.startsWith("Bearer")) {
      console.error("No JWT token provided");
      return NextResponse.json(
        { error: "Unauthorized: No token provided" },
        { status: 401 },
      );
    }

    let userID: string;
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET!,
      ) as jwt.JwtPayload;
      userID = decoded.sub as string;
    } catch (error) {
      console.error("Invalid JWT token: ", error);
      return NextResponse.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 },
      );
    }

    if (!userID) {
      console.error("User ID is null or undefined from JWT token");
      return NextResponse.json(
        { error: "Unauthorized: Invalid user ID" },
        { status: 401 },
      );
    }

    // ------------------------------------------------------------------------------------------------
    // 2. Fetch user subscription and paywall the user if needed
    // ------------------------------------------------------------------------------------------------
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthISO = startOfMonth.toISOString();

    const [subscriptionResult, apiUsageResult] = await Promise.all([
      supabase
        .from("subscriptions")
        .select(
          "id, plan_id, price_id, status, stripe_customer_id, current_period_start, current_period_end",
        )
        .eq("user_id", userID)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .maybeSingle(),
      supabase
        .from("api_usage")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userID)
        .gte("created_at", startOfMonthISO),
    ]);

    const { data: userSubscription, error: subscriptionError } =
      subscriptionResult;
    const { count: monthlyApiUsageCount, error: apiUsageError } =
      apiUsageResult;

    let userTier: string = ProductKeys.FREE_SUBSCRIPTION; // Default to free tier

    if (subscriptionError) {
      console.error("Error fetching user subscription:", subscriptionError);
      // Continue with free tier rather than failing the request
    } else if (userSubscription) {
      // User has an active subscription, determine their tier from plan_id
      userTier = userSubscription.plan_id;
      console.log(
        `User ${userID} is on ${userTier} tier with subscription:`,
        userSubscription.id,
      );
    } else {
      // No active subscription found, user is on free tier
      console.log(
        `User ${userID} has no active subscription, defaulting to free tier`,
      );
    }

    if (apiUsageError) {
      console.error("Error fetching monthly API usage:", apiUsageError);
    }

    console.log(`User tier determined: ${userTier}`);
    console.log(`Monthly API usage count: ${monthlyApiUsageCount || 0}`);

    // If user is on free tier, check their usage limits and paywall them if they exceed the limit
    if (
      userTier === ProductKeys.FREE_SUBSCRIPTION &&
      (monthlyApiUsageCount || 0) >= 15
    ) {
      console.log(
        `User ${userID} has reached free tier monthly limit: ${monthlyApiUsageCount}/15`,
      );
      return NextResponse.json(
        {
          error:
            "You have reached your free monthly messaging limit of 15 messages. Please upgrade your subscription to continue using the service.",
          usage: {
            current: monthlyApiUsageCount,
            limit: 15,
            tier: ProductKeys.FREE_SUBSCRIPTION,
          },
        },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------------------------------------
    // 3. Parse request body
    // ------------------------------------------------------------------------------------------------
    const { messages, snackFiles, chat_session_id, prototype_id } =
      await request.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 },
      );
    }
    const fileManager = new FileManager(snackFiles, prototype_id); // NO DB PERSISTENCE

    // ------------------------------------------------------------------------------------------------
    // 4. Precheck with dispatcher service to ensure nothing is currently building for this prototype
    // ------------------------------------------------------------------------------------------------
    const precheckResponse = await fetch(
      `${process.env.SERVER_ENDPOINT!}/dispatch-precheck`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jwt: token,
          prototype_id: "1813ea64-0a08-4d30-bed8-059d84e22a1d",
        }),
      },
    );

    const precheckData = await precheckResponse.json();
    console.log("Dispatch precheck response:", precheckData);
    if (precheckData.status === "updating") {
      return NextResponse.json(
        {
          error:
            "Cannot chat while a build is currently in progress. Materialize agents won't be able to build your files.",
        },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------------------------------------
    // 5. Load/generate additional project context
    // ------------------------------------------------------------------------------------------------
    const lastMessage = messages[messages.length - 1];
    let userMessage = lastMessage.content;

    // Always inject project context if available (prevents LLM hallucination)
    console.log("🎨 Injecting Expo Snack project context for development...");
    const projectContext = getProjectContext(snackFiles);
    if (projectContext) {
      userMessage += projectContext;
      console.log("✅ Expo Snack project context successfully injected");
    } else {
      console.log("⚠️ No relevant Expo Snack files found to inject");
    }

    // Check if this request expects streaming (new flow)
    const expectsStreaming = request.headers.get("accept") === "text/stream";
    if (!expectsStreaming) {
      return NextResponse.json(
        { error: "Streaming is required for this endpoint." },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------------------------------------
    // 6. Start streamed response to the client
    // ------------------------------------------------------------------------------------------------
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // ------------------------------------------------------------------------------------------------
          // 7. Execute planning phase
          // ------------------------------------------------------------------------------------------------
          const finalResponse = await handlePlanningPhase(
            messages,
            userMessage,
            fileManager,
            snackFiles,
            chat_session_id,
            controller,
            encoder,
          );

          // ------------------------------------------------------------------------------------------------
          // 8. Execute execution phase
          // ------------------------------------------------------------------------------------------------
          await handleExecutionPhase(
            finalResponse,
            fileManager,
            messages,
            snackFiles,
            prototype_id,
            controller,
            encoder,
            chat_session_id,
          );

          // ------------------------------------------------------------------------------------------------
          // 9. Pre-build and dispatch requests
          // ------------------------------------------------------------------------------------------------
          console.log("🚀 Dispatching build request regardless of precheck response");
          
          // Convert fileManager files to the format expected by dispatch endpoint
          const finalFiles = fileManager.getFinalState();
          const filesForDispatch: Record<string, string> = {};
          
          // Convert PrototypeFiles to Record<string, string> format
          Object.entries(finalFiles).forEach(([filePath, file]) => {
            if (file.contents) {
              filesForDispatch[filePath] = file.contents;
            }
          });

          try {
            const dispatchResponse = await fetch(
              `${process.env.SERVER_ENDPOINT!}/dispatch`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  jwt: token,
                  prototype_id: prototype_id,
                  framework: "expo_react_native",
                  files: filesForDispatch,
                  file_scope: "complete",
                  hot_reload: false,
                }),
              },
            );

            const dispatchData = await dispatchResponse.json();
            console.log("📦 Dispatch endpoint response:", dispatchData);
          } catch (error) {
            console.error("❌ Error calling dispatch endpoint:", error);
          }

          // ------------------------------------------------------------------------------------------------
          // 10. Track API usage and get updated count
          // ------------------------------------------------------------------------------------------------
          await supabase.from("api_usage").insert({
            user_id: userID,
            prototype_id: prototype_id || null,
          });

          // Get the updated message count for the current billing period
          let updatedMessageCount = 0;
          // For users with subscription, use their billing period
          let periodStart = startOfMonthISO;
          let periodEnd = new Date().toISOString();

          if (
            userSubscription &&
            userSubscription.current_period_start &&
            userSubscription.current_period_end
          ) {
            periodStart = new Date(
              userSubscription.current_period_start * 1000,
            ).toISOString();
            periodEnd = new Date(
              userSubscription.current_period_end * 1000,
            ).toISOString();
          }

          const { count: newCount, error: countError } = await supabase
            .from("api_usage")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userID)
            .gte("created_at", periodStart)
            .lte("created_at", periodEnd);
          if (countError) {
            console.error("Error fetching updated message count:", countError);
          }
          updatedMessageCount = newCount || 0;
          console.log(
            `Updated message count for user ${userID}: ${updatedMessageCount}`,
          );

          // Send updated message count to client
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "usage_update",
                messageCount: updatedMessageCount,
              })}\n\n`,
            ),
          );

          // ------------------------------------------------------------------------------------------------
          // 11. If the user has an active subscription, send the usage data to Stripe
          // ------------------------------------------------------------------------------------------------
          if (
            userTier === ProductKeys.PRO_SUBSCRIPTION &&
            userSubscription?.stripe_customer_id
          ) {
            try {
              await stripe.billing.meterEvents.create({
                event_name: "materialize_assistant_messages",
                payload: {
                  stripe_customer_id: userSubscription.stripe_customer_id,
                  value: "1",
                },
              });
              console.log(
                `Stripe meter event successfully sent for pro user ${userID}`,
              );
            } catch (stripeError) {
              console.error("Error sending Stripe meter event:", stripeError);
              // Don't fail the request if Stripe meter event fails
            }
          }

          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error:
                  error instanceof Error
                    ? error.message
                    : "Internal server error",
              })}\n\n`,
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        details: process.env.NODE_ENV === "development" ? error : undefined,
      },
      { status: 500 },
    );
  }
}

async function handlePlanningPhase(
  messages: { role: string; content: string }[],
  userMessage: string,
  fileManager: FileManager,
  snackFiles: PrototypeFiles | null,
  chat_session_id: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<string> {
  // Phase 1: Get the planning response
  let response = await generateText({
    model: google("gemini-2.5-flash"),
    system: PLANNING_PROMPT,
    tools: {
      list_files: {
        description: "List all files in the project to understand structure",
        parameters: z.object({}),
      },
      read_file: {
        description: "Read the contents of a specific file in the project",
        parameters: z.object({
          filePath: z
            .string()
            .describe(
              "The file path to read (e.g., 'screens/PaywallScreen.js')",
            ),
        }),
      },
      write_file: {
        description: "Write or update a file in the project",
        parameters: z.object({
          filePath: z.string().describe("The file path to write to"),
          contents: z.string().describe("The complete file contents"),
          operation: z
            .enum(["create", "modify"])
            .default("create")
            .describe(
              "REQUIRED: Use 'create' for new files, 'modify' for existing files (defaults to 'create')",
            ),
        }),
      },
    },
    messages: [
      ...messages
        .slice(0, -1)
        .map((msg: { role: string; content: string }) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
      {
        role: "user" as const,
        content: userMessage,
      },
    ],
  });

  let finalResponse = response.text;
  let toolCallsMade = 0;
  let lastToolCall: { name: string; args: unknown } | null = null;

  // Handle tool calls iteratively for planning
  while (response.toolCalls && response.toolCalls.length > 0) {
    toolCallsMade += response.toolCalls.length;
    console.log(
      `🔄 Processing ${response.toolCalls.length} tool calls (total: ${toolCallsMade})`,
    );

    // Check if we already have a valid plan
    const hasValidPlan =
      finalResponse.includes("EXECUTION_PLAN") &&
      finalResponse.includes("[") &&
      finalResponse.includes("]");

    // Check for duplicate tool calls
    if (response.toolCalls.length === 1) {
      const currentToolCall = response.toolCalls[0];
      const currentCall = {
        name: currentToolCall.toolName,
        args: JSON.stringify(currentToolCall.args),
      };

      if (
        lastToolCall &&
        lastToolCall.name === currentCall.name &&
        lastToolCall.args === currentCall.args
      ) {
        console.log("🚫 Detected duplicate tool call");

        // If we have a valid plan, break the loop
        if (hasValidPlan) {
          console.log("✅ Valid plan detected, proceeding");
          finalResponse +=
            "\n\n✅ Planning complete. Proceeding with execution.";
          break;
        } else {
          // Give the model feedback about duplicate tool calls and ask it to reflect
          console.log(
            "⚠️ No valid plan yet, asking model to reflect on duplicate calls",
          );

          const reflectionMessage = `🔄 REFLECTION NEEDED: You just made a duplicate tool call (${currentCall.name} with the same arguments). This suggests you may be stuck in a loop or not processing the previous results effectively.

WHAT HAPPENED: You called "${currentCall.name}" with arguments: ${currentCall.args}
This is the exact same call you made previously.

PLEASE REFLECT AND CHANGE YOUR APPROACH:
1. Review what information you've already gathered from previous tool calls
2. Consider if you have enough information to proceed with planning
3. Try a different approach - perhaps use a different tool or create the plan with what you know
4. If you keep calling the same tool, you're likely not making progress

Based on the information you've gathered so far, please either:
- Create your EXECUTION_PLAN now if you have sufficient information
- Use a DIFFERENT tool or approach to gather missing information
- Explain what specific information you still need and why

Do NOT repeat the same tool call again.`;

          response = await generateText({
            model: google("gemini-2.5-flash"),
            system: PLANNING_PROMPT,
            messages: [
              ...messages
                .slice(0, -1)
                .map((msg: { role: string; content: string }) => ({
                  role: msg.role as "user" | "assistant",
                  content: msg.content,
                })),
              {
                role: "user" as const,
                content: userMessage,
              },
              {
                role: "assistant" as const,
                content: finalResponse,
              },
              {
                role: "user" as const,
                content: reflectionMessage,
              },
            ],
          });

          finalResponse = response.text;

          // If it still tries to make tool calls after reflection, force completion
          if (response.toolCalls && response.toolCalls.length > 0) {
            console.log(
              "⚠️ Model still trying to make tool calls after reflection, forcing plan creation",
            );
            finalResponse +=
              "\n\n⚠️ Creating execution plan with available information...";
            break;
          }
        }
      }

      lastToolCall = currentCall;
    }

    const toolResults = [];

    // Execute each tool call
    for (const toolCall of response.toolCalls) {
      try {
        const result = fileManager.handleToolCall({
          function: {
            name: toolCall.toolName,
            arguments: toolCall.args,
          },
        });

        toolResults.push({
          toolCallId: toolCall.toolCallId,
          result: JSON.stringify(result),
        });
      } catch (error) {
        console.error(`❌ Tool call failed: ${toolCall.toolName}`, error);
        toolResults.push({
          toolCallId: toolCall.toolCallId,
          result: JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        });
      }
    }

    // Continue the conversation with tool results
    const toolResultsText = toolResults
      .map((tr) => `Tool ${tr.toolCallId}: ${tr.result}`)
      .join("\n");

    let continuationMessage = `Tool results:\n${toolResultsText}\n\nContinue with your task.`;
    // Only inject context every 5 tool calls to avoid confusion
    if (toolCallsMade % 5 === 0) {
      const projectContextContinuation = getProjectContext(snackFiles);
      if (projectContextContinuation) {
        continuationMessage += projectContextContinuation;
      }
    }

    response = await generateText({
      model: google("gemini-2.5-flash"),
      system: PLANNING_PROMPT,
      tools: {
        list_files: {
          description: "List all files in the project to understand structure",
          parameters: z.object({}),
        },
        read_file: {
          description: "Read the contents of a specific file in the project",
          parameters: z.object({
            filePath: z.string().describe("The file path to read"),
          }),
        },
        write_file: {
          description: "Write or update a file in the project",
          parameters: z.object({
            filePath: z.string().describe("The file path to write to"),
            contents: z.string().describe("The complete file contents"),
            operation: z
              .enum(["create", "modify"])
              .default("create")
              .describe(
                "REQUIRED: Use 'create' for new files, 'modify' for existing files (defaults to 'create')",
              ),
          }),
        },
      },
      messages: [
        ...messages
          .slice(0, -1)
          .map((msg: { role: string; content: string }) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          })),
        {
          role: "user" as const,
          content: userMessage,
        },
        {
          role: "assistant" as const,
          content: finalResponse,
        },
        {
          role: "user" as const,
          content: continuationMessage,
        },
      ],
    });

    finalResponse = response.text;

    // Prevent infinite loops
    if (toolCallsMade > 50) {
      finalResponse += `\n\n⚠️ Maximum tool calls reached (50).`;
      break;
    }
  }

  // Ensure we have a valid plan before proceeding
  const hasValidPlan =
    finalResponse.includes("EXECUTION_PLAN") &&
    finalResponse.includes("[") &&
    finalResponse.includes("]");

  if (!hasValidPlan) {
    console.log("⚠️ No valid execution plan found, generating fallback plan");

    const fallbackResponse = await generateText({
      model: google("gemini-2.5-flash"),
      system:
        PLANNING_PROMPT +
        "\n\nCRITICAL: You MUST create an EXECUTION_PLAN in the exact format specified. Do not use any tools.",
      messages: [
        ...messages
          .slice(0, -1)
          .map((msg: { role: string; content: string }) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          })),
        {
          role: "user" as const,
          content: userMessage,
        },
        {
          role: "assistant" as const,
          content: finalResponse,
        },
        {
          role: "user" as const,
          content:
            "You must now create a detailed EXECUTION_PLAN based on the user's request. Format it exactly as specified in your instructions.",
        },
      ],
    });

    finalResponse += "\n\n" + fallbackResponse.text;
  }

  // Save planning message to database
  const { data: planningMessage } = await supabase
    .from("prototype_chat_messages")
    .insert({
      chat_session_id: chat_session_id,
      content: finalResponse,
      role: "assistant",
      phase: "planning",
    })
    .select()
    .single();

  // Send planning response
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({
        type: "planning",
        content: finalResponse,
        updatedFiles: fileManager.getFinalState(),
        messageId: planningMessage?.id,
      })}\n\n`,
    ),
  );

  return finalResponse;
}

async function handleExecutionPhase(
  finalResponse: string,
  fileManager: FileManager,
  messages: { role: string; content: string }[],
  snackFiles: PrototypeFiles | null,
  prototype_id: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  chat_session_id: string,
) {
  // Check if the response contains an execution plan
  if (finalResponse.includes("EXECUTION_PLAN")) {
    const planningResult = extractExecutionPlan(finalResponse);

    if (planningResult.hasPlan && planningResult.operations.length > 0) {
      // Send execution start
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "execution_start",
            operations: planningResult.operations,
          })}\n\n`,
        ),
      );

      // Execute each operation step by step
      for (let i = 0; i < planningResult.operations.length; i++) {
        const operation = planningResult.operations[i];

        // Send step start
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "step_start",
              stepIndex: i,
              operation: operation,
            })}\n\n`,
          ),
        );

        try {
          const stepResult = await executeStep(
            operation,
            fileManager,
            messages,
            snackFiles,
            prototype_id,
          );

          // Send step completion
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "step_complete",
                stepIndex: i,
                operation: operation,
                result: stepResult,
                success: stepResult.hasResult,
              })}\n\n`,
            ),
          );
        } catch (error) {
          console.error(`Error executing step ${i + 1}:`, error);

          // Send step error
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "step_error",
                stepIndex: i,
                operation: operation,
                error: error instanceof Error ? error.message : "Unknown error",
              })}\n\n`,
            ),
          );
        }
      }

      // Send execution complete
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "execution_complete",
            updatedFiles: fileManager.getFinalState(),
          })}\n\n`,
        ),
      );

      // Save execution summary message to database
      const executionSummary = `🎉 Execution completed! Successfully processed ${planningResult.operations.length} operations:\n\n${planningResult.operations
        .map((op, index) => `${index + 1}. ${op.title} (${op.type})`)
        .join("\n")}`;

      await supabase.from("prototype_chat_messages").insert({
        chat_session_id: chat_session_id,
        content: executionSummary,
        role: "assistant" as const,
        phase: "execution",
      });
    }
  }
}

// Helper function to execute a single step
async function executeStep(
  operation: {
    id: string;
    type: "create" | "modify" | "delete" | "move";
    title: string;
    description: string;
    filePath: string;
    newFilePath?: string;
  },
  fileManager: FileManager,
  messages: { role: string; content: string }[],
  snackFiles: PrototypeFiles | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prototype_id: string,
) {
  const executionContext = `
EXECUTING STEP: ${operation.id}
Type: ${operation.type}
File: ${operation.filePath}
Task: ${operation.title}
Description: ${operation.description}

Execute this step using the available tools.`;

  // Force discovery before creation for screens
  let context = executionContext;
  if (operation.type === "create" && operation.filePath.includes("Screen")) {
    context += `

MANDATORY: Before creating this screen, you MUST:
1. Use list_files to see all existing components
2. Use read_file to examine similar existing screens for import patterns
3. Only use imports that you've verified exist
4. If needed components don't exist, create a basic implementation or note the dependency`;
  }

  const lastMessage = messages[messages.length - 1];
  let userMessage = `${context}\n\nOriginal request: ${lastMessage.content}`;

  // Always inject project context
  const projectContext = getProjectContext(snackFiles);
  if (projectContext) {
    userMessage += projectContext;
  }

  // Use AI SDK with tool support
  let response = await generateText({
    model: google("gemini-2.5-flash"),
    system: EXECUTION_PROMPT,
    tools: {
      list_files: {
        description: "List all files in the project to understand structure",
        parameters: z.object({}),
      },
      read_file: {
        description: "Read the contents of a specific file in the project",
        parameters: z.object({
          filePath: z.string().describe("The file path to read"),
        }),
      },
      write_file: {
        description: "Write or update a file in the project",
        parameters: z.object({
          filePath: z.string().describe("The file path to write to"),
          contents: z.string().describe("The complete file contents"),
          operation: z
            .enum(["create", "modify"])
            .default("create")
            .describe(
              "REQUIRED: Use 'create' for new files, 'modify' for existing files (defaults to 'create')",
            ),
        }),
      },
    },
    messages: [
      ...messages
        .slice(0, -1)
        .map((msg: { role: string; content: string }) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
      {
        role: "user" as const,
        content: userMessage,
      },
    ],
  });

  let finalResponse = response.text;
  let toolCallsMade = 0;
  let lastToolCall: { name: string; args: unknown } | null = null;

  // Handle tool calls iteratively
  while (response.toolCalls && response.toolCalls.length > 0) {
    toolCallsMade += response.toolCalls.length;
    console.log(
      `🔄 Processing ${response.toolCalls.length} tool calls for step ${operation.id}`,
    );

    // Check for duplicate tool calls
    if (response.toolCalls.length === 1) {
      const currentToolCall = response.toolCalls[0];
      const currentCall = {
        name: currentToolCall.toolName,
        args: JSON.stringify(currentToolCall.args),
      };

      if (
        lastToolCall &&
        lastToolCall.name === currentCall.name &&
        lastToolCall.args === currentCall.args
      ) {
        console.log(
          "🚫 Detected duplicate tool call in execution, asking for reflection",
        );

        const reflectionMessage = `🔄 EXECUTION REFLECTION: You just made a duplicate tool call during step execution (${currentCall.name} with the same arguments). This indicates you may be stuck or not processing previous results.

CURRENT STEP: ${operation.title} (${operation.type})
TARGET FILE: ${operation.filePath}

WHAT HAPPENED: You called "${currentCall.name}" with arguments: ${currentCall.args}
This is the exact same call you made in the previous iteration.

PLEASE REFLECT AND ADJUST YOUR APPROACH:
1. Review the results from your previous tool calls - what did you learn?
2. Consider if you have enough information to complete this specific step
3. If you keep reading the same file, perhaps you should now write/modify it
4. If you keep listing files, perhaps you should read a specific file instead
5. Focus ONLY on completing this one step: ${operation.description}

Either:
- Complete the assigned step with a write_file operation if you have sufficient information
- Use a DIFFERENT tool to gather specific missing information
- Explain exactly what information you still need and why

Do NOT repeat the same tool call. Focus on completing this single step.`;

        response = await generateText({
          model: google("gemini-2.5-flash"),
          system: EXECUTION_PROMPT,
          messages: [
            ...messages
              .slice(0, -1)
              .map((msg: { role: string; content: string }) => ({
                role: msg.role as "user" | "assistant",
                content: msg.content,
              })),
            {
              role: "user" as const,
              content: userMessage,
            },
            {
              role: "assistant" as const,
              content: finalResponse,
            },
            {
              role: "user" as const,
              content: reflectionMessage,
            },
          ],
        });

        finalResponse = response.text;

        // If it still tries to make tool calls after reflection, force completion
        if (response.toolCalls && response.toolCalls.length > 0) {
          console.log(
            "⚠️ Model still making tool calls after execution reflection, stopping",
          );
          finalResponse +=
            "\n\n⚠️ Step execution completed with available information.";
          break;
        }

        break;
      }

      lastToolCall = currentCall;
    }

    const toolResults = [];

    // Execute each tool call
    for (const toolCall of response.toolCalls) {
      try {
        const result = fileManager.handleToolCall({
          function: {
            name: toolCall.toolName,
            arguments: toolCall.args,
          },
        });

        toolResults.push({
          toolCallId: toolCall.toolCallId,
          result: JSON.stringify(result),
        });
      } catch (error) {
        console.error(`❌ Tool call failed: ${toolCall.toolName}`, error);
        toolResults.push({
          toolCallId: toolCall.toolCallId,
          result: JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        });
      }
    }

    // Check if step is complete based on successful file write operations
    let hasSuccessfulWriteOperation = false;

    // Check if any write operations were successful
    for (const toolResult of toolResults) {
      try {
        const result = JSON.parse(toolResult.result);
        if (
          result.success &&
          result.operation &&
          (result.operation === "create" || result.operation === "modify")
        ) {
          hasSuccessfulWriteOperation = true;
          break;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    const isStepComplete = hasSuccessfulWriteOperation;

    if (isStepComplete) {
      console.log(`✅ Step completed: ${operation.id} - ${operation.title}`);
      finalResponse += `\n\n✅ Step completed: ${operation.title}`;
      break;
    }

    // Prevent infinite loops
    if (toolCallsMade >= 50) {
      console.log("⚠️ Step execution taking too long, forcing completion");
      finalResponse += `\n\n⚠️ Step execution reached maximum attempts (50). Current progress saved.`;
      break;
    }

    // Continue the conversation with tool results
    const toolResultsText = toolResults
      .map((tr) => `Tool ${tr.toolCallId}: ${tr.result}`)
      .join("\n");

    let continuationMessage = `Tool results:\n${toolResultsText}\n\nBased on the tool results, complete your assigned step. If the step is complete, provide a summary and stop.`;
    // Only inject context every 3 tool calls to avoid confusion in execution
    if (toolCallsMade % 3 === 0) {
      const projectContextContinuation = getProjectContext(snackFiles);
      if (projectContextContinuation) {
        continuationMessage += projectContextContinuation;
      }
    }

    response = await generateText({
      model: google("gemini-2.5-flash"),
      system: EXECUTION_PROMPT,
      tools: {
        list_files: {
          description: "List all files in the project to understand structure",
          parameters: z.object({}),
        },
        read_file: {
          description: "Read the contents of a specific file in the project",
          parameters: z.object({
            filePath: z.string().describe("The file path to read"),
          }),
        },
        write_file: {
          description: "Write or update a file in the project",
          parameters: z.object({
            filePath: z.string().describe("The file path to write to"),
            contents: z.string().describe("The complete file contents"),
            operation: z
              .enum(["create", "modify"])
              .default("create")
              .describe(
                "REQUIRED: Use 'create' for new files, 'modify' for existing files (defaults to 'create')",
              ),
          }),
        },
      },
      messages: [
        ...messages
          .slice(0, -1)
          .map((msg: { role: string; content: string }) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          })),
        {
          role: "user" as const,
          content: userMessage,
        },
        {
          role: "assistant" as const,
          content: finalResponse,
        },
        {
          role: "user" as const,
          content: continuationMessage,
        },
      ],
    });

    finalResponse = response.text;
  }

  return {
    content: finalResponse,
    updatedFiles: fileManager.getFinalState(),
    hasResult:
      finalResponse.includes("✅ Step completed") ||
      finalResponse.includes("Successfully"),
  };
}

// Get project context from the Expo Snack files instead of scanning filesystem
function getProjectContext(snackFiles: PrototypeFiles | null): string {
  try {
    console.log("🔍 Building context from Expo Snack files...");

    if (!snackFiles || Object.keys(snackFiles).length === 0) {
      console.log("⚠️ No snack files provided for context");
      return "";
    }

    const relevantFiles: { path: string; content: string; category: string }[] =
      [];

    // Look for theme-related files
    const themePatterns = [
      /theme/i,
      /style/i,
      /design/i,
      /color/i,
      /ui\/.*component/i,
    ];

    // Look for component and screen files
    const componentPatterns = [
      /components\//i,
      /screens\//i,
      /hooks\//i,
      /utils\//i,
      /constants\//i,
    ];

    // Analyze each snack file
    Object.entries(snackFiles).forEach(([filePath, file]) => {
      if (!file.contents) return;

      // Check if file matches theme patterns
      const isThemeRelated = themePatterns.some(
        (pattern) => pattern.test(filePath) || pattern.test(file.name || ""),
      );

      // Check if file matches component patterns
      const isComponentRelated = componentPatterns.some(
        (pattern) => pattern.test(filePath) || pattern.test(file.name || ""),
      );

      // Include relevant files
      if (
        (isThemeRelated || isComponentRelated) &&
        (filePath.endsWith(".ts") ||
          filePath.endsWith(".tsx") ||
          filePath.endsWith(".js") ||
          filePath.endsWith(".jsx"))
      ) {
        const category = isThemeRelated ? "theme" : "component";
        relevantFiles.push({
          path: filePath,
          content: file.contents,
          category,
        });
        console.log(`✅ Found ${category} file in snack: ${filePath}`);
      }

      // Include config files
      if (
        filePath.includes("package.json") ||
        filePath.includes("app.json") ||
        filePath.includes("expo.json")
      ) {
        relevantFiles.push({
          path: filePath,
          content: file.contents,
          category: "config",
        });
        console.log(`✅ Found config file in snack: ${filePath}`);
      }
    });

    // Build context string
    let projectContext = "";

    if (relevantFiles.length > 0) {
      projectContext = `\n\n🎨 EXPO SNACK PROJECT CONTEXT: The following files are available in this React Native project:\n`;

      const themeFiles = relevantFiles.filter((f) => f.category === "theme");
      const componentFiles = relevantFiles.filter(
        (f) => f.category === "component",
      );
      const configFiles = relevantFiles.filter((f) => f.category === "config");

      if (themeFiles.length > 0) {
        projectContext += `\n=== THEME/UI FILES ===\n`;
        themeFiles.forEach((file) => {
          projectContext += `\n--- ${file.path} ---\n${file.content}\n`;
        });
      }

      if (componentFiles.length > 0) {
        projectContext += `\n=== COMPONENTS & SCREENS ===\n`;
        componentFiles.forEach((file) => {
          projectContext += `\n--- ${file.path} ---\n${file.content}\n`;
        });
      }

      if (configFiles.length > 0) {
        projectContext += `\n=== CONFIG FILES ===\n`;
        configFiles.forEach((file) => {
          projectContext += `\n--- ${file.path} ---\n${file.content}\n`;
        });
      }
    }

    console.log(
      `✅ Expo Snack context built with ${relevantFiles.length} files`,
    );
    return projectContext;
  } catch (error) {
    console.warn("Could not build Expo Snack context:", error);
    return "";
  }
}

class FileManager {
  private files: Map<string, PrototypeFile>;
  private prototypeId: string | null;

  constructor(snackFiles: PrototypeFiles | null, prototypeId?: string) {
    this.files = new Map(Object.entries(snackFiles || {}));
    this.prototypeId = prototypeId || null;
  }

  handleToolCall(toolCall: {
    function: { name: string; arguments: Record<string, unknown> };
  }) {
    const { name, arguments: args } = toolCall.function;

    console.log(`🔧 TOOL CALL: ${name}`, { arguments: args });

    switch (name) {
      case "read_file":
        return this.readFile(args.filePath as string);

      case "write_file":
        return this.writeFile(
          args.filePath as string,
          args.contents as string,
          args.operation as string | undefined,
        );

      case "list_files":
        return this.listFiles();

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  readFile(filePath: string) {
    const file = this.files.get(filePath);
    if (!file) {
      return { error: `File not found: ${filePath}` };
    }
    return {
      success: true,
      filePath,
      contents: file.contents || "",
      exists: true,
    };
  }

  writeFile(filePath: string, contents: string, operation?: string) {
    // Default to "create" if operation is not provided
    const op = operation || "create";
    const existingFile = this.files.get(filePath);

    if (op === "modify" && !existingFile) {
      console.error(`❌ Cannot modify non-existent file: ${filePath}`);
      return { error: `Cannot modify non-existent file: ${filePath}` };
    }

    if (op === "create" && existingFile) {
      console.error(
        `❌ File already exists: ${filePath}. Use 'modify' operation.`,
      );
      return {
        error: `File already exists: ${filePath}. Use 'modify' operation.`,
      };
    }

    // Update in-memory state
    const updatedFile = {
      ...existingFile,
      name: filePath,
      contents,
      id: existingFile?.id || `file-${Date.now()}`,
      prototype_id: existingFile?.prototype_id || this.prototypeId,
      created_at: existingFile?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as PrototypeFile;

    this.files.set(filePath, updatedFile);

    console.log(
      `✅ Successfully ${op}d file ${filePath} in memory (database updates handled by client)`,
    );

    // Database updates are handled by the client filesystem
    // The client will receive the updated files through the getFinalState() method
    // and handle database persistence through the file system manager

    return {
      success: true,
      filePath,
      operation: op,
      message: `Successfully ${op}d ${filePath}`,
    };
  }

  listFiles() {
    const fileList = Array.from(this.files.keys()).map((filePath) => ({
      filePath,
      name: this.files.get(filePath)?.name || filePath,
      exists: true,
    }));

    return { success: true, files: fileList };
  }

  // Get final state for updating database/snack
  getFinalState() {
    const result: PrototypeFiles = {};
    for (const [filePath, file] of this.files) {
      result[filePath] = file;
    }
    return result;
  }
}

const PLANNING_PROMPT = `You are a React Native development assistant in PLANNING mode. Your job is to create detailed execution plans and use tools to understand the current project structure.

AVAILABLE TOOLS:
- list_files: See all files in the project
- read_file: Read content of specific files
- write_file: Write or modify files (use sparingly in planning, mostly for execution)

IMPORTANT: You have access to the following packages without needing to install them:
- expo-linear-gradient
- @expo/vector-icons
- @react-navigation/native
- @react-navigation/native-stack
- @react-navigation/bottom-tabs
- react-native-reanimated
- zustand

CRITICAL IMPORT RULES:
- NEVER import components that don't exist
- Use list_files and read_file to discover available components before planning
- Only import from files that actually exist in the project
- When creating screens, first check what components are available
- Always provide the available imports context in your plan
- Zustand persistence is NOT SUPPORTED. The USER will DIE if you add a 'zustand/middleware' import. DO NOT IMPORT IT BY ANY MEANS!

PROJECT STRUCTURE RULES:
- screens/ - individual screen components (HomeScreen.js, PaywallScreen.js, etc.)
- components/ - reusable UI components (Button.js, Card.js, etc.)
- App.js - main app with navigation (ONLY touch when absolutely necessary)

GENERAL GUIDELINES:
- If the user asks you to do something that is not related to the project, you should politely decline and say that you are only a React Native development assistant.
- If the user says to create a new screen without mentioning if you should show it in the app, you should assume you must show it in the app.
- If there's a navigation stack in App.js and if you are asked to add a new screen to App.js as part of the navigation stack, make sure that App.js DOES NOT have placeholder screens or components in the file that interfere with showing the REAL screen.

PLANNING WORKFLOW:
1. Use list_files to understand current project structure and see what files are available in the project
2. Use read_file to examine relevant existing files
3. Create a detailed execution plan with specific steps
4. Each step should specify exact file paths and operations
5. Always verify available components before planning imports

Create execution plans in this format:
**EXECUTION_PLAN:**
[
  {
    "id": "step_1",
    "type": "create|modify", 
    "title": "Brief description",
    "filePath": "exact/path/to/file.js",
    "description": "Detailed description of what will be done"
  }
]

ALWAYS use tools first to understand the project before planning!`;

const EXECUTION_PROMPT = `You are a React Native development assistant in EXECUTION mode. You will execute ONE specific step from a plan.

AVAILABLE TOOLS:
- read_file: Read current file content before modifying
- write_file: Write or update files
- list_files: Check project structure if needed

CRITICAL EXECUTION RULES:
- Execute ONLY the assigned step - do not go beyond it
- Always read files before modifying them to understand current state
- After writing a file, your step is COMPLETE - do not make additional changes
- Provide a clear completion summary when done
- We are writing JAVASCRIPT code, so you should use the correct syntax for the language.

IMPORT SAFETY RULES:
- Before writing any file, use read_file to check existing similar files for import patterns
- Only import components/files that you've verified exist
- If you need a component that doesn't exist, note it as a dependency for future steps
- Use the project context to see what's actually available. You can use the list_files tool to verify that a file exists before using it in an import.
- NEVER import a component that doesn't exist.
- NEVER import a file that does not ALREADY exist in the project.
- Do NOT make any assumptions about the project structure or the future state of the project structure or files.

DESIGN RULES:
- When creating a new screen, you should create a new file for the screen.
- When creating a screen, you should keep in mind information hierarchy and how the user will take in the information on the screen.
- You should keep in the importance of beautiful UI design and creating a great user experience.
- When creating cards, you should keep in mind that card widths on the screen should be consistent and should be about 90% of the screen width, so that there's a nice margin between the screen edges and the cards.

PROJECT STRUCTURE RULES:
- screens/ - individual screen components (screens/PaywallScreen.js)
- components/ - reusable UI components (components/Button.js)  
- App.js - main app with navigation (modify ONLY when absolutely necessary).

EXECUTION WORKFLOW:
1. Read the assigned step details carefully
2. Use read_file to get current content of files you're modifying (if needed)
3. Use write_file to make the specific change for this step
4. Provide complete, working code that follows React Native best practices
5. Confirm step completion with a summary

STEP COMPLETION CRITERIA:
- For "create" steps: Successfully create the new file with required content
- For "modify" steps: Successfully update the existing file with required changes
- Once you write a file, your step is complete - do not continue with additional operations

You will receive a specific step to execute. Complete it fully and stop.`;
