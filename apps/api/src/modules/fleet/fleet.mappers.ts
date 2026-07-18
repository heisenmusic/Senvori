import type {
  PlayerConnectivity,
  PlayerDeviceDetail,
  PlayerDeviceSummary,
  PlayerRuntimeState,
  PlayerStorageStatus,
} from "@senvori/contracts";

interface DeviceSummaryRow {
  id: string;
  name: string;
  platform: string;
  status: string;
  zoneId: string;
  unitId: string | null;
  unitName: string | null;
  installedVersion: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const asPlatform = (p: string): PlayerDeviceSummary["platform"] =>
  p === "windows" || p === "web" ? p : "android";

const asStatus = (s: string): PlayerDeviceSummary["status"] =>
  s === "active" || s === "offline" || s === "decommissioned" ? s : "pending";

export const toDeviceSummary = (row: DeviceSummaryRow): PlayerDeviceSummary => ({
  id: row.id,
  name: row.name,
  platform: asPlatform(row.platform),
  status: asStatus(row.status),
  zoneId: row.zoneId,
  unitId: row.unitId,
  unitName: row.unitName,
  installedVersion: row.installedVersion,
  lastSeenAt: iso(row.lastSeenAt),
  createdAt: row.createdAt.toISOString(),
});

interface DeviceDetailRow {
  device: {
    id: string;
    name: string;
    platform: string;
    status: string;
    zoneId: string;
    installedVersion: string | null;
    createdAt: Date;
  };
  unitId: string | null;
  unitName: string | null;
  heartbeat: {
    lastSeenAt: Date | null;
    runtimeState: string | null;
    connectivity: string | null;
    effectivePlanHash: string | null;
    currentItemId: string | null;
    storage: Record<string, unknown> | null;
    lastError: string | null;
    lastSyncAt: Date | null;
    contractVersion: string | null;
  } | null;
}

const asRuntimeState = (v: string | null): PlayerRuntimeState | null =>
  (v as PlayerRuntimeState | null) ?? null;
const asConnectivity = (v: string | null): PlayerConnectivity | null =>
  (v as PlayerConnectivity | null) ?? null;

const asStorage = (v: Record<string, unknown> | null): PlayerStorageStatus | null => {
  if (!v || typeof v.totalBytes !== "number") return null;
  return {
    totalBytes: Number(v.totalBytes),
    freeBytes: Number(v.freeBytes ?? 0),
    cacheBytes: Number(v.cacheBytes ?? 0),
  };
};

export const toDeviceDetail = (
  row: DeviceDetailRow,
  hasActiveCredential: boolean,
): PlayerDeviceDetail => {
  const hb = row.heartbeat;
  return {
    id: row.device.id,
    name: row.device.name,
    platform: asPlatform(row.device.platform),
    status: asStatus(row.device.status),
    zoneId: row.device.zoneId,
    unitId: row.unitId,
    unitName: row.unitName,
    installedVersion: row.device.installedVersion,
    lastSeenAt: iso(hb?.lastSeenAt ?? null),
    createdAt: row.device.createdAt.toISOString(),
    runtimeState: asRuntimeState(hb?.runtimeState ?? null),
    connectivity: asConnectivity(hb?.connectivity ?? null),
    effectivePlanHash: hb?.effectivePlanHash ?? null,
    currentItemId: hb?.currentItemId ?? null,
    storage: asStorage(hb?.storage ?? null),
    lastError: hb?.lastError ?? null,
    lastSyncAt: iso(hb?.lastSyncAt ?? null),
    contractVersion: hb?.contractVersion ?? null,
    hasActiveCredential,
  };
};
