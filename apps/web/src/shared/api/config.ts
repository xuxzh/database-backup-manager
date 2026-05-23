import type { PublicAppConfig } from "@/types/api";
import { apiRequest } from "./http";

export const fallbackPublicConfig: PublicAppConfig = {
  server: {
    bindAddr: "0.0.0.0:8080",
  },
  defaults: {
    targetBaseDir: "~/backups",
    sshPort: 22,
  },
};

export function getPublicConfig() {
  return apiRequest<PublicAppConfig>("/config/public");
}
