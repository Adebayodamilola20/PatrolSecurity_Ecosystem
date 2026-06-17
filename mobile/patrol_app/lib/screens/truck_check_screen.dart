import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/theme.dart';

class TruckCheckScreen extends StatefulWidget {
  const TruckCheckScreen({super.key});

  @override
  State<TruckCheckScreen> createState() => _TruckCheckScreenState();
}

class _TruckCheckScreenState extends State<TruckCheckScreen> {
  final _formKey = GlobalKey<FormState>();
  final _driverCtrl = TextEditingController();
  final _plateCtrl = TextEditingController();
  final _companyCtrl = TextEditingController();
  final _purposeCtrl = TextEditingController();
  final _cargoCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  List<Map<String, dynamic>> _activeTrucks = [];
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _driverCtrl.dispose();
    _plateCtrl.dispose();
    _companyCtrl.dispose();
    _purposeCtrl.dispose();
    _cargoCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await ApiService.getTruckLogs(status: 'active');
      _activeTrucks = data.cast<Map<String, dynamic>>();
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _checkIn() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      await ApiService.truckCheckIn(
        driverName: _driverCtrl.text.trim(),
        plateNumber: _plateCtrl.text.trim(),
        company: _companyCtrl.text.trim(),
        purpose: _purposeCtrl.text.trim(),
        cargoDescription: _cargoCtrl.text.trim(),
        notes: _notesCtrl.text.trim(),
      );
      if (mounted) {
        _driverCtrl.clear();
        _plateCtrl.clear();
        _companyCtrl.clear();
        _purposeCtrl.clear();
        _cargoCtrl.clear();
        _notesCtrl.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Truck checked in'), backgroundColor: AppTheme.verified),
        );
        _load();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed: ${e.toString().replaceFirst("Exception: ", "")}'),
            backgroundColor: AppTheme.flagged,
          ),
        );
      }
    }
    if (mounted) setState(() => _submitting = false);
  }

  Future<void> _checkOut(String id) async {
    try {
      await ApiService.truckCheckOut(id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Truck checked out'), backgroundColor: AppTheme.verified),
        );
        _load();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed: ${e.toString().replaceFirst("Exception: ", "")}'),
            backgroundColor: AppTheme.flagged,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Truck Check In / Out')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            elevation: 0,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: AppTheme.border)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Check In Truck', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    const SizedBox(height: 12),
                    TextFormField(controller: _driverCtrl, decoration: const InputDecoration(labelText: 'Driver Name *', border: OutlineInputBorder()), validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null),
                    const SizedBox(height: 10),
                    TextFormField(controller: _plateCtrl, decoration: const InputDecoration(labelText: 'Plate Number', border: OutlineInputBorder())),
                    const SizedBox(height: 10),
                    TextFormField(controller: _companyCtrl, decoration: const InputDecoration(labelText: 'Company', border: OutlineInputBorder())),
                    const SizedBox(height: 10),
                    TextFormField(controller: _purposeCtrl, decoration: const InputDecoration(labelText: 'Purpose', border: OutlineInputBorder())),
                    const SizedBox(height: 10),
                    TextFormField(controller: _cargoCtrl, maxLines: 2, decoration: const InputDecoration(labelText: 'Cargo Description', border: OutlineInputBorder())),
                    const SizedBox(height: 10),
                    TextFormField(controller: _notesCtrl, maxLines: 2, decoration: const InputDecoration(labelText: 'Notes', border: OutlineInputBorder())),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: _submitting ? null : _checkIn,
                        child: _submitting ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Check In'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text('Active Trucks (${_activeTrucks.length})', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 8),
          if (_loading)
            const Center(child: CircularProgressIndicator())
          else if (_activeTrucks.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: Text('No active trucks', style: TextStyle(color: AppTheme.textSecondary))),
              ),
            )
          else
            ..._activeTrucks.map((t) {
              return Card(
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: AppTheme.border)),
                child: ListTile(
                  title: Text(t['driverName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text('${t['plateNumber'] ?? '-'} • ${t['company'] ?? ''}'),
                  trailing: FilledButton.tonalIcon(
                    onPressed: () => _checkOut(t['id']),
                    icon: const Icon(Icons.logout, size: 16),
                    label: const Text('Check Out'),
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}
