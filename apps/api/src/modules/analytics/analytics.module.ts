import { Module } from "@nestjs/common";

/**
 * Analytics domain module — SENVORI_CORE_DOMAINS.md §13.
 *
 * Foundation phase: module boundary only; entities, business rules and APIs land in
 * later phases. D2 boundary rule: no module imports another module's internals —
 * communication happens through public interfaces or system events only.
 */
@Module({})
export class AnalyticsModule {}
