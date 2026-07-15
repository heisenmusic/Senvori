import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { CatalogRepository } from "./catalog.repository";
import { CatalogService } from "./catalog.service";
import { ProcessingService } from "./processing.service";
import { StorageBlobController } from "./storage-blob.controller";
import { StorageModule } from "./storage/storage.module";

/**
 * Catalog domain module — SENVORI_CORE_DOMAINS.md §4. Media-asset foundation:
 * secure direct upload, processing, metadata and the library. Depends on the
 * global Common/Database/Auth modules (tenant context, RBAC, audit) and its own
 * StorageModule for the pluggable storage driver.
 */
@Module({
  imports: [StorageModule],
  controllers: [CatalogController, StorageBlobController],
  providers: [CatalogService, CatalogRepository, ProcessingService],
  exports: [ProcessingService],
})
export class CatalogModule {}
