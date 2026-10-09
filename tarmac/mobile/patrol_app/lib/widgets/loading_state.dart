import 'package:flutter/material.dart';
import '../utils/theme.dart';

/// A spinner that says what it is waiting for.
///
/// A bare `CircularProgressIndicator` on a night shift over a weak connection
/// tells the guard nothing except that something is happening — not whether
/// their checkpoints are coming, whether the app is stuck, or whether it is
/// worth walking somewhere with better signal. The label costs one line and
/// answers all three.
class LoadingState extends StatelessWidget {
  final String label;

  const LoadingState({super.key, required this.label});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            height: 28,
            width: 28,
            child: CircularProgressIndicator(strokeWidth: 3),
          ),
          const SizedBox(height: 12),
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
          ),
        ],
      ),
    );
  }
}
