import { SenvoriClient } from "@senvori/sdk";
import { API_URL } from "./config";

/** Shared typed API client (cookie session, credentials included). */
export const api = new SenvoriClient({ baseUrl: API_URL });
