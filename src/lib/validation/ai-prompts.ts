import { z } from "zod";

export const aiPromptSchema = z.object({
  promptText: z.string().min(1, "Prompt text is required").max(500),
});

export type AiPromptInput = z.infer<typeof aiPromptSchema>;
