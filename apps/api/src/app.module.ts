import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./auth/auth.module";
import { CommonModule } from "./common/common.module";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { TenancyModule } from "./modules/tenancy/tenancy.module";
import { FleetModule } from "./modules/fleet/fleet.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { LicensingModule } from "./modules/licensing/licensing.module";
import { PlaylistsModule } from "./modules/playlists/playlists.module";
import { SchedulingModule } from "./modules/scheduling/scheduling.module";
import { CampaignsModule } from "./modules/campaigns/campaigns.module";
import { BrandExperienceModule } from "./modules/brand-experience/brand-experience.module";
import { RetailMediaModule } from "./modules/retail-media/retail-media.module";
import { MarketplaceModule } from "./modules/marketplace/marketplace.module";
import { BillingModule } from "./modules/billing/billing.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AiModule } from "./modules/ai/ai.module";

/**
 * Modular monolith (D2): one module per domain, mirroring SENVORI_CORE_DOMAINS.md.
 * Module boundaries are extraction seams for future services — kept clean from commit 1.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    AuthModule,
    CommonModule,
    HealthModule,
    // Foundation
    IdentityModule,
    TenancyModule,
    BillingModule,
    // Content & rights
    CatalogModule,
    LicensingModule,
    PlaylistsModule,
    // Distribution
    SchedulingModule,
    CampaignsModule,
    BrandExperienceModule,
    // Execution
    FleetModule,
    // Ecosystem monetization
    RetailMediaModule,
    MarketplaceModule,
    // Intelligence
    AnalyticsModule,
    AiModule,
  ],
})
export class AppModule {}
