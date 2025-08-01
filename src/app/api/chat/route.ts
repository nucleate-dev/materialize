import { Database } from "@/lib/types/database.types";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY ?? "";

const google = createGoogleGenerativeAI({
  apiKey: GOOGLE_AI_API_KEY,
});

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
          args.operation as string,
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

  writeFile(filePath: string, contents: string, operation: string) {
    const existingFile = this.files.get(filePath);

    if (operation === "modify" && !existingFile) {
      console.error(`❌ Cannot modify non-existent file: ${filePath}`);
      return { error: `Cannot modify non-existent file: ${filePath}` };
    }

    if (operation === "create" && existingFile) {
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

    // SOURISH: REMOVING THIS -- WE SHOULD UPDATE THE DATABASE FROM THE CLIENT
    // Persist to database if prototypeId is available
    // if (this.prototypeId) {
    //   try {
    //     console.log(`💾 Saving file to database: ${filePath}`);

    //     if (existingFile?.id) {
    //       // Update existing file in database
    //       const { error } = await supabase
    //         .from("prototype_files")
    //         .update({
    //           contents,
    //           updated_at: new Date().toISOString(),
    //         })
    //         .eq("id", existingFile.id);

    //       if (error) {
    //         console.error(
    //           `❌ Error updating file ${filePath} in database:`,
    //           error,
    //         );
    //         return {
    //           error: `Database update failed for ${filePath}: ${error.message}`,
    //         };
    //       }
    //       console.log(`✅ Successfully updated file ${filePath} in database`);
    //     } else {
    //       // Create new file in database
    //       const { data, error } = await supabase
    //         .from("prototype_files")
    //         .insert({
    //           prototype_id: this.prototypeId,
    //           name: filePath,
    //           contents,
    //         })
    //         .select()
    //         .single();

    //       if (error) {
    //         console.error(
    //           `❌ Error creating file ${filePath} in database:`,
    //           error,
    //         );
    //         return {
    //           error: `Database insert failed for ${filePath}: ${error.message}`,
    //         };
    //       }

    //       // Update the in-memory file with the database ID
    //       if (data) {
    //         this.files.set(filePath, { ...updatedFile, id: data.id });
    //         console.log(
    //           `✅ Successfully created file ${filePath} in database with ID: ${data.id}`,
    //         );
    //       }
    //     }
    //   } catch (error) {
    //     console.error(`❌ Unexpected error saving file ${filePath}:`, error);
    //     return {
    //       error: `Unexpected error saving ${filePath}: ${error instanceof Error ? error.message : "Unknown error"}`,
    //     };
    //   }
    // } else {
    //   console.warn(
    //     `⚠️ No prototypeId provided, file ${filePath} not saved to database`,
    //   );
    // }

    return {
      success: true,
      filePath,
      operation,
      message: `Successfully ${operation}d ${filePath}`,
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
- zustand

CRITICAL IMPORT RULES:
- NEVER import components that don't exist
- Use list_files and read_file to discover available components before planning
- Only import from files that actually exist in the project
- When creating screens, first check what components are available
- Always provide the available imports context in your plan

PROJECT STRUCTURE RULES:
- screens/ - individual screen components (HomeScreen.js, PaywallScreen.js, etc.)
- components/ - reusable UI components (Button.js, Card.js, etc.)
- App.js - main app with navigation (ONLY touch when absolutely necessary)

GENERAL GUIDELINES:
- If the user asks you to do something that is not related to the project, you should politely decline and say that you are only a React Native development assistant.
- If the user says to create a new screen without mentioning if you should show it in the app, you should assume you must show it in the app.
-


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

PROJECT STRUCTURE RULES:
- screens/ - individual screen components (screens/PaywallScreen.js)
- components/ - reusable UI components (components/Button.js)  
- App.js - main app with navigation (modify ONLY when absolutely necessary)

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

type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];

interface PrototypeFiles {
  [filePath: string]: PrototypeFile;
}

// Allow longer response times for AI generation
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const {
      messages,
      snackFiles,
      chat_session_id,
      phase,
      stepOperation,
      prototype_id,
      user_id,
    } = await request.json();

    if (!GOOGLE_AI_API_KEY) {
      return NextResponse.json(
        { error: "Google AI API key not configured" },
        { status: 500 },
      );
    }

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 },
      );
    }

    // Initialize file manager with prototype_id for database persistence
    const fileManager = new FileManager(snackFiles, prototype_id);

    // Determine phase
    const isExecutionPhase =
      phase === "execution" || phase === "step_execution";
    const selectedPrompt = isExecutionPhase
      ? EXECUTION_PROMPT
      : PLANNING_PROMPT;

    // For execution phase, include step context
    let executionContext = "";
    if (isExecutionPhase && stepOperation) {
      executionContext = `
EXECUTING STEP: ${stepOperation.id}
Type: ${stepOperation.type}
File: ${stepOperation.filePath}
Task: ${stepOperation.title}
Description: ${stepOperation.description}

Execute this step using the available tools.`;

      // Force discovery before creation for screens
      if (
        stepOperation.type === "create" &&
        stepOperation.filePath.includes("Screen")
      ) {
        executionContext += `

MANDATORY: Before creating this screen, you MUST:
1. Use list_files to see all existing components
2. Use read_file to examine similar existing screens for import patterns
3. Only use imports that you've verified exist
4. If needed components don't exist, create a basic implementation or note the dependency`;
      }
    }

    const lastMessage = messages[messages.length - 1];
    let userMessage = executionContext
      ? `${executionContext}\n\nOriginal request: ${lastMessage.content}`
      : lastMessage.content;

    // Always inject project context if available (prevents LLM hallucination)
    console.log("🎨 Injecting Expo Snack project context for development...");
    const projectContext = getProjectContext(snackFiles);
    if (projectContext) {
      userMessage += projectContext;
      console.log("✅ Expo Snack project context successfully injected");
    } else {
      console.log("⚠️ No relevant Expo Snack files found to inject");
    }

    // Use AI SDK with tool support
    let response = await generateText({
      model: google("gemini-2.5-flash"),
      system: selectedPrompt,
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
              .describe(
                "Whether this is creating a new file or modifying existing",
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

    // Handle tool calls iteratively
    while (response.toolCalls && response.toolCalls.length > 0) {
      toolCallsMade += response.toolCalls.length;
      console.log(
        `🔄 Processing ${response.toolCalls.length} tool calls (total: ${toolCallsMade})`,
      );

      const toolResults = [];
      let hasWriteOperation = false;

      // Execute each tool call
      for (const toolCall of response.toolCalls) {
        try {
          console.log(
            `📞 Executing tool call: ${toolCall.toolName} (ID: ${toolCall.toolCallId})`,
          );
          const result = fileManager.handleToolCall({
            function: {
              name: toolCall.toolName,
              arguments: toolCall.args,
            },
          });

          // Track if we performed a write operation
          if (toolCall.toolName === "write_file") {
            hasWriteOperation = true;
          }

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

      // For execution phase, check if step is complete
      if (isExecutionPhase && stepOperation) {
        const isStepComplete =
          hasWriteOperation ||
          (stepOperation.type === "create" && hasWriteOperation) ||
          (stepOperation.type === "modify" && hasWriteOperation) ||
          finalResponse.toLowerCase().includes("step complete") ||
          finalResponse.toLowerCase().includes("completed successfully");

        if (isStepComplete) {
          console.log(
            `✅ Step completed: ${stepOperation.id} - ${stepOperation.title}`,
          );
          finalResponse += `\n\n✅ Step completed: ${stepOperation.title}`;
          break;
        }

        // Prevent infinite loops in execution phase - if we've made several calls without completing
        if (toolCallsMade >= 250) {
          console.log("⚠️ Execution phase taking too long, forcing completion");
          finalResponse += `\n\n⚠️ Step execution reached maximum attempts. Current progress saved.`;
          break;
        }
      }

      // Continue the conversation with tool results
      const toolResultsText = toolResults
        .map((tr) => `Tool ${tr.toolCallId}: ${tr.result}`)
        .join("\n");

      // Different continuation prompts based on phase
      let continuationPrompt = "Continue with your task.";
      if (isExecutionPhase) {
        continuationPrompt =
          "Based on the tool results, complete your assigned step. If the step is complete, provide a summary and stop.";
      }

      // Always add project context to continuation to maintain consistency
      let continuationMessage = `Tool results:\n${toolResultsText}\n\n${continuationPrompt}`;
      const projectContextContinuation = getProjectContext(snackFiles);
      if (projectContextContinuation) {
        continuationMessage += projectContextContinuation;
      }

      response = await generateText({
        model: google("gemini-2.5-flash"),
        system: selectedPrompt,
        tools: {
          list_files: {
            description:
              "List all files in the project to understand structure",
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
                .describe("Create or modify operation"),
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

      // Prevent infinite loops - reduced limit for execution phase
      const maxCalls = isExecutionPhase ? 35 : 50;
      if (toolCallsMade > maxCalls) {
        finalResponse += `\n\n⚠️ Maximum tool calls reached (${maxCalls}).`;
        break;
      }
    }

    // Save to database
    const { data: assistantResponse, error: insertError } = await supabase
      .from("prototype_chat_messages")
      .insert({
        chat_session_id: chat_session_id,
        content: finalResponse,
        role: "assistant",
        phase: isExecutionPhase ? "execution" : "planning",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting assistant response:", insertError);
      throw new Error("Error inserting assistant response into database");
    }

    // Track API usage
    if (user_id) {
      const { error: usageError } = await supabase.from("api_usage").insert({
        user_id: user_id,
        prototype_id: prototype_id || null,
      });

      if (usageError) {
        console.error("Error tracking API usage:", usageError);
      }
    }

    return NextResponse.json({
      ...assistantResponse,
      updatedFiles: fileManager.getFinalState(),
      toolCallsMade,
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
