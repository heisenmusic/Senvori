import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LocalFs } from "./local-fs";
import { LocalStorageProvider } from "./local-storage.provider";
import { R2StorageProvider } from "./r2-storage.provider";
import { STORAGE, type StorageProvider } from "./storage.provider";

/**
 * Provides the active storage driver (§4 PART 5). STORAGE_DRIVER selects local
 * (filesystem, dev/test) or r2 (Cloudflare, production). LocalFs is always
 * available for the signed blob endpoint used by the local driver.
 */
@Module({
  providers: [
    {
      provide: LocalFs,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new LocalFs(config.getOrThrow<string>("STORAGE_LOCAL_DIR")),
    },
    {
      provide: STORAGE,
      inject: [ConfigService, LocalFs],
      useFactory: (config: ConfigService, fs: LocalFs): StorageProvider => {
        const driver = config.getOrThrow<string>("STORAGE_DRIVER");
        if (driver === "r2") {
          return new R2StorageProvider({
            endpoint: config.getOrThrow<string>("R2_ENDPOINT"),
            region: config.getOrThrow<string>("R2_REGION"),
            bucket: config.getOrThrow<string>("R2_BUCKET"),
            accessKeyId: config.getOrThrow<string>("R2_ACCESS_KEY_ID"),
            secretAccessKey: config.getOrThrow<string>("R2_SECRET_ACCESS_KEY"),
          });
        }
        return new LocalStorageProvider(
          fs,
          config.getOrThrow<string>("BETTER_AUTH_URL"),
          config.getOrThrow<string>("BETTER_AUTH_SECRET"),
        );
      },
    },
  ],
  exports: [STORAGE, LocalFs],
})
export class StorageModule {}
