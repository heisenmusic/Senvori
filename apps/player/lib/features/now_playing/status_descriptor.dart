import 'package:flutter/material.dart';

import '../../design_system/tokens.dart';
import '../../l10n/app_localizations.dart';
import '../connectivity/connectivity.dart';
import 'now_playing_view_state.dart';

/// Maps an [OperationalStatus] to an icon, colour and localized label/detail.
/// Centralised so every surface presents state consistently (Sprint 09 · §33).
final class StatusDescriptor {
  const StatusDescriptor({
    required this.icon,
    required this.color,
    required this.label,
    this.detail,
  });

  final IconData icon;
  final Color color;
  final String label;
  final String? detail;

  static StatusDescriptor of(OperationalStatus status, L10n l10n) {
    switch (status) {
      case OperationalStatus.online:
        return StatusDescriptor(
          icon: Icons.cloud_done_outlined,
          color: SenvoriColors.online,
          label: l10n.statusOnline,
        );
      case OperationalStatus.offlineOperational:
        return StatusDescriptor(
          icon: Icons.cloud_off_outlined,
          color: SenvoriColors.offline,
          label: l10n.statusOfflineOperational,
          detail: l10n.statusOfflineDetail,
        );
      case OperationalStatus.syncing:
        return StatusDescriptor(
          icon: Icons.sync,
          color: SenvoriColors.syncing,
          label: l10n.statusSyncing,
          detail: l10n.statusSyncingDetail,
        );
      case OperationalStatus.downloading:
        return StatusDescriptor(
          icon: Icons.download_outlined,
          color: SenvoriColors.syncing,
          label: l10n.statusDownloading,
        );
      case OperationalStatus.ready:
        return StatusDescriptor(
          icon: Icons.check_circle_outline,
          color: SenvoriColors.online,
          label: l10n.statusReady,
        );
      case OperationalStatus.playing:
        return StatusDescriptor(
          icon: Icons.graphic_eq,
          color: SenvoriColors.accent,
          label: l10n.statusPlaying,
        );
      case OperationalStatus.degraded:
        return StatusDescriptor(
          icon: Icons.error_outline,
          color: SenvoriColors.degraded,
          label: l10n.statusDegraded,
          detail: l10n.statusDegradedDetail,
        );
      case OperationalStatus.emergency:
        return StatusDescriptor(
          icon: Icons.warning_amber_rounded,
          color: SenvoriColors.emergency,
          label: l10n.statusEmergency,
        );
      case OperationalStatus.noPlan:
        return StatusDescriptor(
          icon: Icons.event_busy_outlined,
          color: SenvoriColors.offline,
          label: l10n.statusNoPlan,
        );
      case OperationalStatus.noContent:
        return StatusDescriptor(
          icon: Icons.library_music_outlined,
          color: SenvoriColors.offline,
          label: l10n.statusNoContent,
        );
      case OperationalStatus.storageLow:
        return StatusDescriptor(
          icon: Icons.sd_storage_outlined,
          color: SenvoriColors.warning,
          label: l10n.statusStorageLow,
        );
    }
  }

  static StatusDescriptor connectivity(ConnectivityState state, L10n l10n) {
    if (state.canReachApi) {
      return StatusDescriptor(
        icon: Icons.cloud_done_outlined,
        color: SenvoriColors.online,
        label: l10n.statusOnline,
      );
    }
    return StatusDescriptor(
      icon: Icons.cloud_off_outlined,
      color: SenvoriColors.offline,
      label: l10n.statusOfflineOperational,
    );
  }
}
