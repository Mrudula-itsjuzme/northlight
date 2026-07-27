import "server-only";
import { config as modularConfig } from "@/config";

export const config = modularConfig;
export type Config = typeof config;