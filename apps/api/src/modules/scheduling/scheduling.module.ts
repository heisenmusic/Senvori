import { Module } from "@nestjs/common";
import { SchedulingController } from "./scheduling.controller";
import { SchedulingRepository } from "./scheduling.repository";
import { SchedulingService } from "./scheduling.service";

/**
 * Scheduling domain module — SENVORI_CORE_DOMAINS.md §7, Sprint 08.
 *
 * Schedule assignments + the pure deterministic resolver (which published program
 * plays for a unit at a local date/time) + effective-plan preview (base vs
 * effective hash). The RRULE/manifest tables in schema/scheduling.ts remain the
 * future device-compilation layer (ADR-08-01) and are not used here. Depends on
 * the global Common/Database modules (tenant context, RBAC, transactional audit).
 */
@Module({
  controllers: [SchedulingController],
  providers: [SchedulingService, SchedulingRepository],
  // Exported so the Fleet module (device execution plan, Sprint 10A) can reuse
  // the tenant-scoped assignment/local-event repository without re-implementing it.
  exports: [SchedulingRepository],
})
export class SchedulingModule {}
