import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  type CatalogItemDto,
  type CatalogItemListQuery,
  catalogItemListQuerySchema,
  type CreateUploadInput,
  createUploadSchema,
  type DownloadTicket,
  type UpdateCatalogItemInput,
  updateCatalogItemSchema,
  type UploadTicket,
} from "@senvori/contracts";
import { CurrentContext } from "../../common/auth/current-context.decorator";
import type { RequestContext } from "../../common/context/request-context";
import { RequirePermission } from "../../common/rbac/require-permission.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { CatalogService } from "./catalog.service";

/**
 * Catalog REST surface (§4 PART 7/16). Thin controllers: validation via
 * ZodValidationPipe, authorization via @RequirePermission (catalog is
 * tenant-scoped this sprint), all logic in CatalogService.
 */
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Post("uploads")
  @RequirePermission("catalog:asset:upload")
  createUpload(
    @CurrentContext() ctx: RequestContext,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createUploadSchema)) input: CreateUploadInput,
  ): Promise<UploadTicket> {
    return this.catalog.createUpload(ctx, input, idempotencyKey ?? null);
  }

  @Post("uploads/:id/confirm")
  @HttpCode(200)
  @RequirePermission("catalog:asset:upload")
  confirm(@CurrentContext() ctx: RequestContext, @Param("id") id: string): Promise<CatalogItemDto> {
    return this.catalog.confirmUpload(ctx, id);
  }

  @Get("items")
  @RequirePermission("catalog:item:read")
  list(
    @Query(new ZodValidationPipe(catalogItemListQuerySchema)) query: CatalogItemListQuery,
  ): Promise<{ items: CatalogItemDto[]; nextCursor: string | null }> {
    return this.catalog.listItems(query);
  }

  @Get("items/:id")
  @RequirePermission("catalog:item:read")
  get(@Param("id") id: string): Promise<CatalogItemDto> {
    return this.catalog.getItem(id);
  }

  @Patch("items/:id")
  @RequirePermission("catalog:item:update")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCatalogItemSchema)) input: UpdateCatalogItemInput,
  ): Promise<CatalogItemDto> {
    return this.catalog.updateItem(id, input);
  }

  @Post("items/:id/archive")
  @HttpCode(204)
  @RequirePermission("catalog:item:archive")
  async archive(@Param("id") id: string): Promise<void> {
    await this.catalog.archiveItem(id);
  }

  @Post("items/:id/reprocess")
  @HttpCode(200)
  @RequirePermission("catalog:asset:reprocess")
  reprocess(
    @CurrentContext() ctx: RequestContext,
    @Param("id") id: string,
  ): Promise<CatalogItemDto> {
    return this.catalog.reprocessItem(ctx, id);
  }

  @Get("items/:id/download")
  @RequirePermission("catalog:asset:download")
  download(@Param("id") id: string): Promise<DownloadTicket> {
    return this.catalog.downloadItem(id);
  }
}
