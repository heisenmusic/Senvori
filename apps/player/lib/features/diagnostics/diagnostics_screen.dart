import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../design_system/components.dart';
import '../../design_system/tokens.dart';
import '../../l10n/app_localizations.dart';

/// Sanitized diagnostics snapshot. Built by the runtime; never contains tokens,
/// secrets, full signed URLs, or other tenants' data (Sprint 09 · §34).
final class DiagnosticsData {
  const DiagnosticsData({
    required this.maskedDeviceId,
    required this.unit,
    required this.tenant,
    required this.appVersion,
    required this.schemaVersion,
    required this.activePlanHash,
    required this.basePlanHash,
    required this.effectivePlanHash,
    required this.lastSync,
    required this.connectivity,
    required this.disk,
    required this.assets,
    required this.queue,
    required this.uptime,
    required this.platform,
    required this.recentEvents,
  });

  final String maskedDeviceId;
  final String unit;
  final String tenant;
  final String appVersion;
  final String schemaVersion;
  final String activePlanHash;
  final String basePlanHash;
  final String effectivePlanHash;
  final String lastSync;
  final String connectivity;
  final String disk;
  final String assets;
  final String queue;
  final String uptime;
  final String platform;
  final List<String> recentEvents;

  /// A copy-able, already-sanitized text report.
  String toReport() => [
    'device=$maskedDeviceId',
    'unit=$unit',
    'tenant=$tenant',
    'appVersion=$appVersion',
    'schemaVersion=$schemaVersion',
    'effectivePlanHash=$effectivePlanHash',
    'basePlanHash=$basePlanHash',
    'connectivity=$connectivity',
    'disk=$disk',
    'assets=$assets',
    'queue=$queue',
    'uptime=$uptime',
    'platform=$platform',
  ].join('\n');
}

/// Protected diagnostics mode (Sprint 09 · §34). Distinct from Now Playing — it
/// never pollutes the main screen. For support use.
final class DiagnosticsScreen extends StatelessWidget {
  const DiagnosticsScreen({super.key, required this.data});
  final DiagnosticsData data;

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    return Scaffold(
      backgroundColor: SenvoriColors.surface0,
      appBar: AppBar(
        backgroundColor: SenvoriColors.surface1,
        title: Text(
          l10n.diagnosticsTitle,
          style: SenvoriType.subtitle(SenvoriColors.textPrimary),
        ),
        actions: [
          IconButton(
            tooltip: l10n.diagnosticsCopyReport,
            icon: const Icon(Icons.copy_all_outlined),
            onPressed: () =>
                Clipboard.setData(ClipboardData(text: data.toReport())),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(SenvoriSpacing.lg),
        children: [
          DiagnosticRow(
            label: l10n.diagnosticsDevice,
            value: data.maskedDeviceId,
          ),
          DiagnosticRow(label: l10n.diagnosticsUnit, value: data.unit),
          DiagnosticRow(label: l10n.diagnosticsTenant, value: data.tenant),
          DiagnosticRow(
            label: l10n.diagnosticsAppVersion,
            value: data.appVersion,
          ),
          DiagnosticRow(
            label: l10n.diagnosticsSchemaVersion,
            value: data.schemaVersion,
          ),
          DiagnosticRow(
            label: l10n.diagnosticsBaseHash,
            value: data.basePlanHash,
          ),
          DiagnosticRow(
            label: l10n.diagnosticsEffectiveHash,
            value: data.effectivePlanHash,
          ),
          DiagnosticRow(label: l10n.diagnosticsLastSync, value: data.lastSync),
          DiagnosticRow(
            label: l10n.diagnosticsConnectivity,
            value: data.connectivity,
          ),
          DiagnosticRow(label: l10n.diagnosticsDisk, value: data.disk),
          DiagnosticRow(label: l10n.diagnosticsAssets, value: data.assets),
          DiagnosticRow(label: l10n.diagnosticsQueue, value: data.queue),
          DiagnosticRow(label: l10n.diagnosticsUptime, value: data.uptime),
          DiagnosticRow(label: l10n.diagnosticsPlatform, value: data.platform),
          const Divider(
            height: SenvoriSpacing.xl,
            color: SenvoriColors.surface3,
          ),
          Text(
            l10n.diagnosticsRecentEvents,
            style: SenvoriType.label(SenvoriColors.textTertiary),
          ),
          const SizedBox(height: SenvoriSpacing.sm),
          for (final e in data.recentEvents)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Text(
                e,
                style: SenvoriType.mono(SenvoriColors.textSecondary),
              ),
            ),
        ],
      ),
    );
  }
}
