import { Module } from "@nestjs/common";
import { StorageModule } from "../catalog/storage/storage.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { DeviceAuthGuard } from "./device-auth.guard";
import { ExecutionPlanService } from "./execution-plan.service";
import { FleetAdminController } from "./fleet-admin.controller";
import { FleetAdminService } from "./fleet-admin.service";
import { FleetRepository } from "./fleet.repository";
import { PlayerActivationService } from "./player-activation.service";
import { PlayerController } from "./player.controller";
import { PlayerRuntimeService } from "./player-runtime.service";

/**
 * Fleet domain module — SENVORI_CORE_DOMAINS.md §3, Sprint 10A.
 *
 * The Player↔backend integration foundation: device activation (proof-of-
 * possession pairing), device-authenticated session/heartbeat/telemetry, the
 * effective execution plan a device fetches, and minimal Fleet administration.
 * Reuses the pre-existing Fleet/Analytics tables and the pure Scheduling resolver
 * (via SchedulingRepository) + the catalog storage signer (StorageModule) — it
 * does not re-implement scheduling or storage. Depends on the global Common/
 * Database modules (tenant context, RBAC, transactional audit).
 */
@Module({
  imports: [SchedulingModule, StorageModule],
  controllers: [PlayerController, FleetAdminController],
  providers: [
    FleetRepository,
    DeviceAuthGuard,
    PlayerActivationService,
    PlayerRuntimeService,
    ExecutionPlanService,
    FleetAdminService,
  ],
})
export class FleetModule {}
