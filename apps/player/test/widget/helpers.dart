import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/design_system/theme.dart';
import 'package:senvori_player/l10n/app_localizations.dart';

/// Wraps a widget in the localized, themed app frame at a chosen size and
/// locale, for widget and golden tests.
Future<void> pumpApp(
  WidgetTester tester,
  Widget child, {
  Size size = const Size(1280, 720),
  Locale locale = const Locale('en'),
  bool reduceMotion = false,
  bool settle = true,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      locale: locale,
      theme: SenvoriTheme.dark(),
      debugShowCheckedModeBanner: false,
      localizationsDelegates: const [
        L10n.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: L10n.supportedLocales,
      home: MediaQuery(
        data: MediaQueryData(size: size, disableAnimations: reduceMotion),
        child: child,
      ),
    ),
  );
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    // Screens with an intentional indeterminate spinner never settle; pump a
    // couple of frames instead.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }
}
