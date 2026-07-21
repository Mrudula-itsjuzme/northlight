import { z } from "zod";

export const competitorSchema = z.object({
  name: z.string().min(1, "Competitor name is required").max(300),
  domain: z
    .string()
    .min(1, "Domain is required")
    .max(300)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a valid domain, e.g. example.com"),
});

export type CompetitorInput = z.infer<typeof competitorSchema>;

export const competitorPageSchema = z.object({
  url: z.string().url("Enter a valid URL"),
  title: z.string().max(300).optional().or(z.literal("")),
});

export type CompetitorPageInput = z.infer<typeof competitorPageSchema>;

export const gapReportTypes = ["content", "schema", "faq", "backlink", "ai_citation"] as const;
export type GapReportType = (typeof gapReportTypes)[number];
