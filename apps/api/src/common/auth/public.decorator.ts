import { SetMetadata } from "@nestjs/common";

/** Marks a route as public — skips the auth/tenant-context guard. */
export const IS_PUBLIC_KEY = "senvori:isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
