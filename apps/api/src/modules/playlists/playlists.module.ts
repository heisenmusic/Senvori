import { Module } from "@nestjs/common";
import { PlaylistsController } from "./playlists.controller";
import { PlaylistsRepository } from "./playlists.repository";
import { PlaylistsService } from "./playlists.service";

/**
 * Playlists / Programming domain module — SENVORI_CORE_DOMAINS.md §6, Sprint 06.
 *
 * Declarative programs (over the playlists schema) + the deterministic compiler
 * for preview and immutable version publishing. Depends on the global
 * Common/Database modules (tenant context, RBAC, transactional audit). The pure
 * compiler lives in ./compiler and is imported by the service — no NestJS coupling.
 */
@Module({
  controllers: [PlaylistsController],
  providers: [PlaylistsService, PlaylistsRepository],
})
export class PlaylistsModule {}
