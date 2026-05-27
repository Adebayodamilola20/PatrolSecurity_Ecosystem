import 'package:flutter/material.dart';

class StatusBadge extends StatelessWidget {
  final bool verified;

  const StatusBadge({super.key, required this.verified});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: verified
            ? const Color(0xFF10B981).withValues(alpha: 0.1)
            : const Color(0xFFF59E0B).withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            verified ? Icons.check_circle : Icons.warning_amber_rounded,
            size: 14,
            color: verified ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
          ),
          const SizedBox(width: 4),
          Text(
            verified ? 'Verified' : 'Flagged',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: verified
                  ? const Color(0xFF10B981)
                  : const Color(0xFFF59E0B),
            ),
          ),
        ],
      ),
    );
  }
}
